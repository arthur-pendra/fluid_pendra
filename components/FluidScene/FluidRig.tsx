'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import {
  Color,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector2,
  Vector3,
  type Group,
  type ShaderMaterial,
} from 'three'
import FloatingObject from './FloatingObject'
import { useFluidSimulation } from './useFluidSimulation'
import { createMotionState, stepMotion, stirPoints } from './objectMotion'
import {
  distanceForHeight,
  ndcToUv,
  planeDirection,
  planeHalfSize,
  screenToSimulationUv,
  uvToPlane,
} from './projection'
import { BASE_HEADING, createFlightState, stepFlight } from './flight'
import { strokeForce, windVector } from './strokeForce'
import { approach, lookYaw, neckWeights, soarAngle, tailAngle } from './pose'
import { createThrustState, stepThrust } from './thrust'
import { localAxis, type BoneChain } from './rig'
import { fullscreenVertexShader } from './shaders/fullscreen'
import { paintingFragmentShader } from './shaders/painting'
import type { FluidSceneConfig, StirSurface, Vec2 } from './types'
import type { PointerState } from './pointer'

/* de camera kijkt recht naar beneden; het zichtbare vlak is twee eenheden
   hoog, dus een object van lengte 1 vult ongeveer de halve hoogte */
const FIELD_OF_VIEW = 45
const VISIBLE_HEIGHT = 2

/** een enkele stap van de cursor mag de vloeistof niet wegblazen */
const MAX_STEP = 0.05

type FluidRigProps = {
  config: FluidSceneConfig
  modelUrl?: string
  paused: boolean
  pointer: React.RefObject<PointerState>
}

const FluidRig = ({ config, modelUrl, paused, pointer }: FluidRigProps) => {
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)

  const objectTarget = useFBO(
    Math.max(2, Math.round(size.width * dpr)),
    Math.max(2, Math.round(size.height * dpr)),
    { depthBuffer: true },
  )

  const brushCount = config.object.stirPoints + 1
  const simulation = useFluidSimulation(config.simulation, brushCount)

  /* eigen scene met alleen het object erin */
  const objectScene = useMemo(() => new Scene(), [])
  const objectCamera = useMemo(() => new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 100), [])
  const objectRef = useRef<Group>(null)

  const distance = useMemo(() => distanceForHeight(FIELD_OF_VIEW, VISIBLE_HEIGHT), [])

  useEffect(() => {
    objectScene.background = new Color(config.object.background)
  }, [objectScene, config.object.background])

  useEffect(() => {
    objectCamera.aspect = size.width / Math.max(size.height, 1)
    objectCamera.up.set(0, 0, -1)
    objectCamera.position.set(0, config.object.height + distance, 0)
    objectCamera.lookAt(0, config.object.height, 0)
    objectCamera.updateProjectionMatrix()
  }, [objectCamera, size.width, size.height, config.object.height, distance])

  const paintingUniforms = useMemo(
    () => ({
      uSimulation: { value: null },
      uObject: { value: null },
      uBackground: { value: new Color(config.background) },
      uPaletteA: { value: new Vector3(...config.painting.paletteBase) },
      uPaletteB: { value: new Vector3(...config.painting.paletteAmplitude) },
      uPaletteC: { value: new Vector3(...config.painting.paletteFrequency) },
      uPaletteD: { value: new Vector3(0.0, 0.33, 0.67) },
      uResolution: { value: new Vector2(1, 1) },
      uShockwaveCenter: { value: new Vector2() },
      uShockwaveProgress: { value: 1 },
      uRatio: { value: 1 },
      uReveal: { value: 0 },
      uTintAmount: { value: config.painting.tintAmount },
      uWarp: { value: config.painting.warp },
      uRippleStrength: { value: config.painting.rippleStrength },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const paintingRef = useRef<ShaderMaterial>(null)

  /* toestand die per frame verandert en geen render hoeft te veroorzaken */
  const motion = useRef(createMotionState())
  const flight = useRef(createFlightState(config.object))
  const thrust = useRef(createThrustState())
  const reveal = useRef(0)
  const travelled = useRef<number[]>([])
  const clickedAt = useRef<number | null>(null)
  const lastClick = useRef<number | null>(null)
  const scratch = useRef(new Vector3())

  /* de procedurele laag: eigen klok, de gedempte kopdraai, en één quaternion die
     hergebruikt wordt zodat er per frame niets gealloceerd wordt */
  const elapsed = useRef(0)
  const neckYaw = useRef(0)
  /* of de vleugels moeten werken; gaat als ref naar het model zodat het sturen
     van de clipklok geen render kost */
  const beating = useRef(1)
  const poseRotation = useRef(new Quaternion())
  const poseAxis = useRef(new Vector3())
  const weights = useRef<{ chain: BoneChain | null; shares: number[] }>({
    chain: null,
    shares: [],
  })

  /* de plekken waarmee een geanimeerd model zichzelf roert; leeg voor de bol en
     voor modellen zonder animatie */
  const stir = useRef<StirSurface>({ mesh: null, vertices: [], rig: null })
  const handleStirSurface = useCallback((surface: StirSurface) => {
    stir.current = surface
  }, [])

  /* dit verandert vrijwel nooit, en het moet als prop mee naar de animatie, dus
     state in plaats van een ref */
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const frozen = paused || reducedMotion

  useFrame((state, rawDelta) => {
    const { gl, scene, camera } = state
    /* na een verborgen tab is de delta enorm; afkappen voorkomt een sprong */
    const delta = Math.min(rawDelta, 1 / 30)
    const ratio = size.width / Math.max(size.height, 1)

    const { halfWidth, halfHeight } = planeHalfSize(FIELD_OF_VIEW, distance, ratio)
    const input = pointer.current
    const now = performance.now()

    /* klik: nieuw doel, een golf, en een nieuwe kleurfase */
    if (input.clickUv && input.clickedAt !== lastClick.current) {
      lastClick.current = input.clickedAt
      clickedAt.current = now
      motion.current.target = uvToPlane(input.clickUv, halfWidth, halfHeight)

      paintingUniforms.uShockwaveCenter.value.set(
        input.clickUv.x * 2 - 1,
        input.clickUv.y * 2 - 1,
      )
      paintingUniforms.uPaletteD.value.set(Math.random(), Math.random(), Math.random())
    }

    /* cursor: hooguit eens per targetThrottle een nieuw doel */
    if (input.uv && now - input.lastTargetAt > config.object.targetThrottle) {
      input.lastTargetAt = now
      motion.current.target = uvToPlane(input.uv, halfWidth, halfHeight)
    }

    const sim = config.simulation

    const surface = stir.current
    const anchored = surface.mesh !== null && surface.vertices.length > 0

    /* Een geanimeerd model vliegt zelf; de bol en stille modellen volgen de
       cursor en driften. Dat onderscheid zit hier en nergens anders. */
    if (!frozen) {
      if (anchored) {
        /* zijwaarts volgt hij de cursor; staat die niet in beeld, dan is het
           midden het doel. Naar voren en achteren doet de cursor (nog) niets. */
        const cursor = input.uv ? uvToPlane(input.uv, halfWidth, halfHeight) : null
        flight.current = stepFlight(
          flight.current,
          config.object,
          thrust.current.boost,
          cursor,
          {
            x: config.object.reachSide * halfWidth,
            y: config.object.reachAhead * halfHeight,
          },
          delta,
        )
      } else {
        motion.current = stepMotion(motion.current, config.object, delta)
      }
    }

    /* De windas kantelt mee met het lijf: zijn spoor hoort achter hém te liggen,
       ook als hij een graad of tien overhelt. Dat werkt daarmee door in de
       vleugelasymmetrie, de stuwkracht en de nek — die lezen alle drie deze ene
       richting. Voor de bol blijft `windDirection` gelden; die heeft geen lijf
       om te kantelen. */
    const windDegrees = anchored
      ? BASE_HEADING + flight.current.bank + 180
      : sim.windDirection
    const heading = planeDirection(windDegrees)
    const place = anchored ? flight.current.position : motion.current.visible

    if (objectRef.current) {
      objectRef.current.position.set(place.x, config.object.height, place.y)
      /* door `spin` staat het model al met zijn kop omhoog op het scherm, en dat
         is de vaste koers, dus wat de kanteling erbij doet is meteen de draai */
      objectRef.current.rotation.y = anchored ? (flight.current.bank * Math.PI) / 180 : 0
    }

    beating.current = anchored ? flight.current.beating : 1

    /* De procedurele laag bovenop de clip.
       De mixer draait op de standaardprioriteit en heeft deze frame de hele
       botstand al geschreven; wat we er nu op vermenigvuldigen geldt dus precies
       één frame en stapelt niet op. Het moet wel vóór `updateMatrixWorld`, want
       daarna is de skinning al beslist. */
    const rig = surface.rig
    if (rig && !frozen) {
      elapsed.current += delta
      const object = config.object
      const rotation = poseRotation.current
      const axis = poseAxis.current

      /* De assen staan in wereldruimte en moeten per frame naar de eigen ruimte
         van elk bot, want een draai die je op `bone.quaternion` vermenigvuldigt
         geldt in het frame waar de clip het bot nú heeft staan. Daarvoor moeten
         de wereldmatrices kloppen met wat de mixer zojuist geschreven heeft. */
      objectScene.updateMatrixWorld(true)

      const tail = rig.tail
      if (tail && object.tailSway !== 0) {
        const last = Math.max(1, tail.bones.length - 1)
        for (let index = 0; index < tail.bones.length; index++) {
          const bone = tail.bones[index]
          rotation.setFromAxisAngle(
            localAxis(bone, tail.axis, axis),
            tailAngle(index / last, elapsed.current, object),
          )
          bone.quaternion.multiply(rotation)
        }
      }

      /* De vleugels in de zweefstand. De clip staat daar stil en een stilstaande
         vleugel ziet er dood uit, dus hier komt een trage correctie overheen.
         Geschaald op hoe weinig hij slaat: tijdens het slaan doet de clip het
         werk en zou dit er alleen tegenin gaan. Per kant een eigen trekking uit
         de ruis, want symmetrie is precies wat het levenloos maakt. */
      const soaring = 1 - flight.current.beating
      if (soaring > 0.01 && object.soarLift > 0) {
        rig.wings.forEach((wing, side) => {
          const last = Math.max(1, wing.bones.length - 1)
          for (let index = 0; index < wing.bones.length; index++) {
            const bone = wing.bones[index]
            rotation.setFromAxisAngle(
              localAxis(bone, wing.axis, axis),
              soarAngle(index / last, elapsed.current, side * 31.7, object) * soaring,
            )
            bone.quaternion.multiply(rotation)
          }
        })
      }

      const neck = rig.neck
      if (neck && object.neckFollow > 0) {
        /* het aandeel per schakel hangt alleen aan de lengte van de keten, dus
           dat blijft staan zolang het model niet verandert */
        if (weights.current.chain !== neck) {
          weights.current = { chain: neck, shares: neckWeights(neck.bones.length) }
        }

        /* waar de draak naartoe kijkt is de windas omgekeerd: de wind gaat naar
           de staart, de kop staat er tegenover. Het doel is de cursor gezien
           vanaf waar de draak op dit moment hangt, niet vanaf de oorsprong. */
        const cursor = input.uv ? uvToPlane(input.uv, halfWidth, halfHeight) : null
        const target = cursor
          ? lookYaw(
              { x: -heading.x, y: -heading.y },
              { x: cursor.x - place.x, y: cursor.y - place.y },
              object.neckFollow,
            )
          : 0

        neckYaw.current = approach(neckYaw.current, target, object.neckRate, delta)

        for (let index = 0; index < neck.bones.length; index++) {
          const bone = neck.bones[index]
          rotation.setFromAxisAngle(
            localAxis(bone, neck.axis, axis),
            neckYaw.current * weights.current.shares[index],
          )
          bone.quaternion.multiply(rotation)
        }
      }
    }

    /* penseel 0 is de cursor, daarna de punten langs het object */
    const brushes = simulation.brushes
    if (travelled.current.length !== brushes.length) {
      travelled.current = brushes.map(() => 0)
    }

    const elapsedSinceClick = clickedAt.current === null ? 0 : (now - clickedAt.current) / 1000
    const shockwaveRunning =
      elapsedSinceClick > 0 && elapsedSinceClick < config.simulation.shockwaveDuration

    /* `wind` is de as waarlangs een vleugelslag asymmetrisch wordt gemaakt; de
       cursor en een drijvend object krijgen hem niet, die hebben geen slag.
       Geeft terug hoeveel van deze slag benedenwinds ging, want dat is meteen
       de stuwkracht die de draak zelf vooruit zet. */
    const applyBrush = (
      index: number,
      screenUv: Vec2Like | null,
      gain: number,
      wind: Vec2 | null,
    ): number => {
      const brush = brushes[index]
      if (!brush) return 0

      if (!screenUv || frozen) {
        brush.force.set(0, 0)
        brush.intensity = 0
        brush.circular = 0
        return 0
      }

      /* naar de ruimte waar de eindpass uit leest, anders staat het spoor
         ergens anders dan de cursor */
      const uv = screenToSimulationUv(screenUv, ratio)

      brush.lastCenter.copy(brush.center)
      brush.lastScale = brush.scale
      brush.center.set(uv.x, uv.y)

      brush.force.subVectors(brush.center, brush.lastCenter)
      const step = brush.force.length()
      if (step > MAX_STEP) brush.force.multiplyScalar(MAX_STEP / step)

      /* opmeten vóór het vormen: dit is de rauwe slag, en daar hangt de
         stuwkracht aan. Na het vormen zou de meting zichzelf lezen. */
      const downwind = wind ? Math.max(0, brush.force.x * wind.x + brush.force.y * wind.y) : 0

      /* de slag mee duwt, de slag terug glijdt. Bewust vóór `gain` en met
         `step` los ervan: straal en intensiteit blijven hangen aan hoe hard de
         vleugel echt beweegt, zodat het model niet meeknippert met zijn slag. */
      if (wind) {
        const shaped = strokeForce(brush.force, wind, sim.strokeBias, sim.strokeSteering)
        brush.force.set(shaped.x, shaped.y)
      }

      brush.force.multiplyScalar(gain)

      /* de straal groeit mee met de snelheid, zoals in het origineel: van een
         vijfde van de basisstraal in rust tot vier vijfde bij volle vaart */
      const normalised = Math.min((step * 2) / sim.screenSpaceSize, sim.brushSpeedRange)
      const factor =
        sim.brushSizeAtRest +
        (normalised / sim.brushSpeedRange) * (sim.brushSizeAtSpeed - sim.brushSizeAtRest)
      brush.scale = sim.brushSize * factor

      /* intensiteit bouwt op met de afgelegde weg, niet met de snelheid */
      travelled.current[index] += step / Math.max(brush.scale, 1e-4)
      brush.intensity = Math.min(1, travelled.current[index] * sim.intensityVariation)

      brush.circular = index === 0 && shockwaveRunning ? elapsedSinceClick : 0

      return downwind
    }

    applyBrush(0, input.uv, sim.cursorForce, null)

    if (anchored && surface.mesh) {
      /* de mixer heeft deze frame alleen de lokale transforms gezet; zonder dit
         leest getVertexPosition de botstand van het vorige frame */
      objectScene.updateMatrixWorld(true)

      const wind = windVector(windDegrees, ratio)
      let downwind = 0

      for (let index = 0; index < config.object.stirPoints; index++) {
        const vertex = surface.vertices[index]
        if (vertex === undefined) {
          applyBrush(index + 1, null, sim.objectForce, wind)
          continue
        }
        surface.mesh.getVertexPosition(vertex, scratch.current)
        surface.mesh.localToWorld(scratch.current).project(objectCamera)
        downwind += applyBrush(
          index + 1,
          ndcToUv(scratch.current.x, scratch.current.y),
          sim.objectForce,
          wind,
        )
      }

      /* de slagkracht van deze frame: gemiddeld per roerpunt zodat het aantal
         punten geen knop wordt, en per seconde zodat de framerate dat ook niet
         is. Wat de draak hiermee doet leest de volgende frame terug. */
      if (!frozen && delta > 0) {
        const push = downwind / Math.max(1, config.object.stirPoints) / delta
        thrust.current = stepThrust(thrust.current, push, config.object, delta)
      }
    } else {
      const points = stirPoints(motion.current, config.object.stirPoints, config.object.length)
      points.forEach((point, index) => {
        scratch.current.set(point.x, config.object.height, point.y).project(objectCamera)
        applyBrush(index + 1, ndcToUv(scratch.current.x, scratch.current.y), sim.objectForce, null)
      })
    }

    /* 1. het object naar zijn eigen render target */
    gl.setRenderTarget(objectTarget)
    gl.render(objectScene, objectCamera)
    gl.setRenderTarget(null)

    /* 2. de vloeistof een stap verder */
    if (!frozen) simulation.step(gl)

    /* 3. de eindpass */
    const painting = paintingRef.current
    if (painting) {
      const uniforms = painting.uniforms
      reveal.current = Math.min(1, reveal.current + delta / config.painting.revealDuration)

      uniforms.uSimulation.value = simulation.texture
      uniforms.uObject.value = objectTarget.texture
      uniforms.uBackground.value.set(config.background)
      uniforms.uResolution.value.set(size.width * dpr, size.height * dpr)
      uniforms.uRatio.value = ratio
      uniforms.uTintAmount.value = config.painting.tintAmount
      uniforms.uWarp.value = config.painting.warp
      uniforms.uRippleStrength.value = config.painting.rippleStrength
      uniforms.uShockwaveProgress.value = shockwaveRunning
        ? elapsedSinceClick / config.simulation.shockwaveDuration
        : 1
      /* sine.inOut, zodat de intro net zo aanzwelt als in het origineel */
      uniforms.uReveal.value = 0.5 - 0.5 * Math.cos(Math.PI * reveal.current)
    }

    gl.render(scene, camera)
  }, 1)

  return (
    <>
      {createPortal(
        <FloatingObject
          ref={objectRef}
          config={config.object}
          modelUrl={modelUrl}
          frozen={frozen}
          beating={beating}
          onStirSurface={handleStirSurface}
        />,
        objectScene,
      )}
      <mesh frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={paintingRef}
          vertexShader={fullscreenVertexShader}
          fragmentShader={paintingFragmentShader}
          uniforms={paintingUniforms}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

type Vec2Like = { x: number; y: number }

export default FluidRig
