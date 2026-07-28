'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import {
  Color,
  PerspectiveCamera,
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
  planeHalfSize,
  screenToSimulationUv,
  uvToPlane,
} from './projection'
import { strokeForce, windVector } from './strokeForce'
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
  const reveal = useRef(0)
  const travelled = useRef<number[]>([])
  const clickedAt = useRef<number | null>(null)
  const lastClick = useRef<number | null>(null)
  const scratch = useRef(new Vector3())

  /* de plekken waarmee een geanimeerd model zichzelf roert; leeg voor de bol en
     voor modellen zonder animatie */
  const stir = useRef<StirSurface>({ mesh: null, vertices: [] })
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

    if (!frozen) motion.current = stepMotion(motion.current, config.object, delta)

    /* een model dat zichzelf roert hoeft niet rond te dwalen om zichtbaar te
       blijven, dus dat blijft in het midden staan */
    const surface = stir.current
    const anchored = surface.mesh !== null && surface.vertices.length > 0

    if (objectRef.current) {
      objectRef.current.position.set(
        anchored ? 0 : motion.current.visible.x,
        config.object.height,
        anchored ? 0 : motion.current.visible.y,
      )
    }

    /* penseel 0 is de cursor, daarna de punten langs het object */
    const brushes = simulation.brushes
    if (travelled.current.length !== brushes.length) {
      travelled.current = brushes.map(() => 0)
    }

    const elapsedSinceClick = clickedAt.current === null ? 0 : (now - clickedAt.current) / 1000
    const shockwaveRunning =
      elapsedSinceClick > 0 && elapsedSinceClick < config.simulation.shockwaveDuration

    const sim = config.simulation

    /* `wind` is de as waarlangs een vleugelslag asymmetrisch wordt gemaakt; de
       cursor en een drijvend object krijgen hem niet, die hebben geen slag */
    const applyBrush = (
      index: number,
      screenUv: Vec2Like | null,
      gain: number,
      wind: Vec2 | null,
    ) => {
      const brush = brushes[index]
      if (!brush) return

      if (!screenUv || frozen) {
        brush.force.set(0, 0)
        brush.intensity = 0
        brush.circular = 0
        return
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
    }

    applyBrush(0, input.uv, sim.cursorForce, null)

    if (anchored && surface.mesh) {
      /* de mixer heeft deze frame alleen de lokale transforms gezet; zonder dit
         leest getVertexPosition de botstand van het vorige frame */
      objectScene.updateMatrixWorld(true)

      const wind = windVector(sim.windDirection, ratio)

      for (let index = 0; index < config.object.stirPoints; index++) {
        const vertex = surface.vertices[index]
        if (vertex === undefined) {
          applyBrush(index + 1, null, sim.objectForce, wind)
          continue
        }
        surface.mesh.getVertexPosition(vertex, scratch.current)
        surface.mesh.localToWorld(scratch.current).project(objectCamera)
        applyBrush(index + 1, ndcToUv(scratch.current.x, scratch.current.y), sim.objectForce, wind)
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
