'use client'

import { Component, Suspense, forwardRef, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import {
  AnimationMixer,
  Box3,
  Mesh,
  MeshMatcapMaterial,
  Quaternion,
  Vector3,
  type AnimationClip,
  type Group,
  type Object3D,
  type SkinnedMesh,
} from 'three'
import { SkeletonUtils } from 'three/examples/jsm/Addons.js'
import { beatProfile, clipRate, foldPhase, soarPhases } from './beat'
import { readRig } from './rig'
import { lightPosition, matcapTexture, shadeLikeTheFish, smoothNormals } from './shading'
import { pickStirPoints } from './stirSurface'
import type { ObjectConfig, PointMotion, StirSurface } from './types'

/** het deel van de configuratie dat bepaalt hoe het model in beeld komt */
type OrientConfig = Pick<ObjectConfig, 'length' | 'flipped' | 'spin'>

/**
 * Het object dat in de render target zweeft. De scene heeft geen lichtbronnen,
 * dus alles krijgt een unlit materiaal: een model met een gewoon PBR-materiaal
 * zou anders zwart blijven.
 *
 * Elk model wordt automatisch gecentreerd en op zijn langste as naar
 * `config.length` geschaald, zodat je je eigen glb erin kunt zetten zonder
 * ergens een getal aan te passen.
 *
 * Brengt het model zijn eigen animatie mee, dan draait die, en worden de plekken
 * op het oppervlak die het hardst bewegen doorgegeven als roerpunten. Het object
 * hoeft dan niet meer rond te dwalen om zichtbaar te blijven: het roert zichzelf.
 */

/** aantal momenten in de clip waarop het oppervlak opgemeten wordt */
const MOTION_SAMPLES = 24

/** elke zoveelste vertex meedoen; alles nakijken is onnodig werk voor een keuze
    tussen een handvol plekken */
const SURFACE_STRIDE = 16

/**
 * Zet het object gecentreerd in beeld, op `length` over zijn langste as.
 *
 * `box` moet de ruimte zijn waar het model echt in uitkomt. Voor een gewone
 * mesh is dat Box3.setFromObject, maar voor een skinned mesh liegt die: die
 * leest de gecachte bind-pose box, en bij deze draak scheelt dat tien eenheden.
 * Vandaar dat de aanroeper de box meegeeft in plaats van hem hier te bepalen.
 *
 * De transform van het object gaat als geheel vooraf aan de skinning, dus een
 * schaal en verplaatsing hier werken op de opgemeten posities zoals verwacht.
 */
const SCREEN_NORMAL = new Vector3(0, 1, 0)
const SCREEN_VERTICAL = new Vector3(0, 0, 1)

const fitToBox = (object: Object3D, box: Box3, config: OrientConfig) => {
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  const scale = longest > 0 ? config.length / longest : 1

  /* De camera kijkt recht naar beneden, dus y is de as waar je langs kijkt en z
     loopt op het scherm van onder naar boven.
     `flipped` is een halve slag om z: je ziet de andere kant van het model,
     terwijl kop en staart dezelfde kant op blijven wijzen.
     `spin` draait in het beeldvlak, om y, en zet dus de kop de goede kant op.
     Eerst flippen, dan draaien, want spin hoort in schermruimte te gelden. */
  const orientation = new Quaternion()
    .setFromAxisAngle(SCREEN_NORMAL, (config.spin * Math.PI) / 180)
    .multiply(new Quaternion().setFromAxisAngle(SCREEN_VERTICAL, config.flipped ? Math.PI : 0))

  object.scale.setScalar(scale)
  object.quaternion.copy(orientation)

  /* de eigen positie van een object wordt niet door zijn eigen schaal en draai
     geraakt, dus het middelpunt moet daar zelf door heen of het model staat
     alsnog scheef zodra een van de twee niet neutraal is */
  object.position.copy(center).multiplyScalar(-scale).applyQuaternion(orientation)
}

/**
 * Het model belichten volgens het recept van de vis, zie shading.ts.
 *
 * Hier stond een `MeshBasicMaterial`, en dat was geen keuze maar een gebrek: de
 * glb komt zonder normalen binnen, en zonder normalen bestaat er geen
 * belichting. Die worden nu berekend, en daarmee kan er een matcap op.
 *
 * `MeshMatcapMaterial` als onderlaag en niet een eigen `ShaderMaterial`. Die
 * doet de matcap-opzoeking al met precies dezelfde formule als IG — die hebben
 * ze daar zelf vandaan — en levert bovendien skinning, mist, het uitsnijden van
 * de vleugelvliezen en het omklappen van de normaal op achterkanten. Alleen de
 * laatste regel, waar de kleur uit komt, wordt vervangen.
 */
const dressModel = (
  object: Object3D,
  color: string,
  uniforms: Record<string, { value: unknown }>,
) => {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return

    /* Een skinned mesh berekent zijn cull-bol uit de bind pose en die wordt
       daarna nog eens met de huidige matrixWorld vermenigvuldigd. Bij een model
       dat geschaald is en beweegt klopt die bol dus niet, en verdwijnt het
       model terwijl het pal in beeld staat. Culling levert hier ook niets op:
       het object is juist op het beeld gepast. */
    child.frustumCulled = false

    smoothNormals(child.geometry)

    const previous = Array.isArray(child.material) ? child.material[0] : child.material
    const material = new MeshMatcapMaterial({
      color: previous?.map ? '#ffffff' : color,
      map: previous?.map ?? null,
      /* de matcap wordt er door de aanroeper op gehangen, zodat een draai aan de
         belichting dit materiaal niet opnieuw laat bouwen */
      /* alphaTest en side overnemen, anders worden uitgesneden delen zoals
         vleugelvliezen dichte vlakken */
      alphaTest: previous?.alphaTest ?? 0,
      transparent: previous?.transparent ?? false,
      side: previous?.side,
      fog: true,
    })

    material.onBeforeCompile = (shader) => {
      /* dezelfde uniform-objecten en geen kopieën: de aanroeper stelt ze
         daardoor bij zonder te hoeven weten of deze shader al gebouwd is */
      Object.assign(shader.uniforms, uniforms)

      /* Alleen de fragment-shader hoeft eraan te geloven: de lamp wordt daar in
         de ruimte van de camera getrokken, dus er is geen extra varying nodig. */
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform vec3 uLightPosition;
           uniform float uLightPunch;
           uniform float uAmbient;
           uniform float uShadeFloor;`,
        )
        .replace(
          'vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;',
          shadeLikeTheFish,
        )
    }

    child.material = material
  })
}

const findSkinnedMesh = (root: Object3D): SkinnedMesh | null => {
  let found: SkinnedMesh | null = null
  root.traverse((child) => {
    if (!found && (child as SkinnedMesh).isSkinnedMesh) found = child as SkinnedMesh
  })
  return found
}

/**
 * Meet op hoe ver elk bekeken oppervlaktepunt zich tijdens de clip verplaatst,
 * in wereldruimte. Draait de clip af op een eigen mixer zodat de echte animatie
 * er niets van merkt.
 *
 * `getVertexPosition` past de botten toe en geeft de plek in de eigen ruimte van
 * de mesh; `localToWorld` maakt daar de plek van waar het punt echt verschijnt.
 * Dat is de enige route die overeenkomt met wat je op het scherm ziet.
 */
const measureSurface = (
  root: Object3D,
  clip: AnimationClip,
): {
  mesh: SkinnedMesh | null
  vertices: number[]
  motion: PointMotion[]
  box: Box3
  speeds: number[]
  spans: number[]
} => {
  const mesh = findSkinnedMesh(root)
  const box = new Box3()
  if (!mesh) return { mesh: null, vertices: [], motion: [], box, speeds: [], spans: [] }

  const total = mesh.geometry.getAttribute('position').count
  const vertices: number[] = []
  for (let vertex = 0; vertex < total; vertex += SURFACE_STRIDE) vertices.push(vertex)

  const mixer = new AnimationMixer(root)
  mixer.clipAction(clip).play()

  const tracks: Vector3[][] = vertices.map(() => [])
  for (let step = 0; step < MOTION_SAMPLES; step++) {
    mixer.setTime((step / MOTION_SAMPLES) * clip.duration)
    root.updateMatrixWorld(true)
    vertices.forEach((vertex, slot) => {
      const point = new Vector3()
      mesh.getVertexPosition(vertex, point)
      mesh.localToWorld(point)
      tracks[slot].push(point)
      /* de box over alle standen van de clip, niet over de bind pose: zo valt
         het model tijdens de hele vleugelslag binnen het beeld */
      box.expandByPoint(point)
    })
  }

  mixer.stopAllAction()
  mixer.uncacheClip(clip)

  const motion = tracks.map((points) => {
    const center = points
      .reduce((sum, point) => sum.add(point), new Vector3())
      .divideScalar(points.length)

    /* de spanwijdte van de beweging, niet de afgelegde weg: een punt dat snel
       heen en weer trilt over een millimeter roert niets, maar zou op afgelegde
       weg wel bovenaan eindigen */
    let amplitude = 0
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        amplitude = Math.max(amplitude, points[a].distanceTo(points[b]))
      }
    }

    return { center: { x: center.x, y: center.y, z: center.z }, amplitude }
  })

  /* Hoe hard het oppervlak op elk moment in de clip beweegt: de som van wat alle
     bekeken punten sinds het vorige monster hebben afgelegd. Dat piekt tijdens
     de vleugelslag en zakt in tijdens het zweven, en daar rekent beat.ts de
     ongelijkmatige klok uit. Rondlopend gemeten, want de clip herhaalt. */
  const speeds = tracks[0]?.map((_, step) => {
    const next = (step + 1) % MOTION_SAMPLES
    return tracks.reduce((sum, points) => sum + points[step].distanceTo(points[next]), 0)
  }) ?? []

  /* De spanwijdte per moment in de clip, over de as waar de vleugels overheen
     staan. Dat is de langste as van het model, dus de as waarop het passen ook
     al gebeurt. Hier vindt beat.ts de stand waarin de vleugels ingeklapt zijn. */
  const size = box.getSize(new Vector3())
  const widest: 'x' | 'y' | 'z' = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z'
  const spans = tracks[0]?.map((_, step) => {
    let low = Infinity
    let high = -Infinity
    for (const points of tracks) {
      const value = points[step][widest]
      if (value < low) low = value
      if (value > high) high = value
    }
    return high - low
  }) ?? []

  return { mesh, vertices, motion, box, speeds, spans }
}

const Sphere = ({ config }: { config: ObjectConfig }) => (
  <mesh>
    <sphereGeometry args={[config.length / 2, 48, 32]} />
    <meshBasicMaterial color={config.color} />
  </mesh>
)

type ModelProps = {
  url: string
  config: ObjectConfig
  frozen: boolean
  /** of de vleugels moeten werken, 0 tot 1; stuurt de klok van de clip aan */
  beating?: React.RefObject<number>
  /** telt hele vleugelslagen op; dive.ts telt daarmee af */
  beats?: React.RefObject<number>
  /** vleugels ingeklapt houden in plaats van gespreid, tijdens de duik */
  folding?: React.RefObject<boolean>
  onStirSurface: (surface: StirSurface) => void
}

const Model = ({ url, config, frozen, beating, beats, folding, onStirSurface }: ModelProps) => {
  const { color, length, stirPoints, flipped, spin } = config

  /* draco staat uit: het model is met meshopt gecomprimeerd, en die decoder zit
     in de bundel in plaats van achter een CDN */
  const { scene, animations } = useGLTF(url, false)

  /* De matcap wordt gerekend en niet geladen, zie shading.ts. Dat is 128 bij 128
     pixels, dus opnieuw maken bij welke knopdraai dan ook kost niets — maar de
     oude moet wel weg, anders lekt er per draai een textuur op de kaart. */
  const matcap = useMemo(() => matcapTexture(config), [config])
  useEffect(() => () => matcap.dispose(), [matcap])

  /* De uniforms van de lamp staan hier en niet in het materiaal, en ze worden
     één keer gemaakt. Dat is met opzet: `onBeforeCompile` draait pas als het
     materiaal voor het eerst getekend wordt, dus een effect dat daarna de
     uniforms wil bijstellen vindt ze nog niet. Door dezelfde objecten in de
     shader te hángen werkt bijstellen ongeacht wanneer dat gebeurt. */
  const uniforms = useMemo(
    () => ({
      uLightPosition: { value: new Vector3() },
      uLightPunch: { value: 0 },
      uAmbient: { value: 0 },
      uShadeFloor: { value: 0 },
    }),
    [],
  )

  useEffect(() => {
    uniforms.uLightPosition.value.copy(lightPosition(config))
    uniforms.uLightPunch.value = config.lightPunch
    uniforms.uAmbient.value = config.ambient
    uniforms.uShadeFloor.value = config.shadeFloor
  }, [uniforms, config])

  const prepared = useMemo(() => {
    /* een skinned model mag niet met Object3D.clone: de nieuwe meshes zouden
       aan het oude skelet blijven hangen */
    const object = SkeletonUtils.clone(scene)
    dressModel(object, color, uniforms)

    const orient = { length, flipped, spin }

    const clip = animations[0]
    if (!clip) {
      fitToBox(object, new Box3().setFromObject(object), orient)
      return {
        object,
        speeds: [],
        spans: [],
        surface: { mesh: null, vertices: [], rig: null } as StirSurface,
      }
    }

    /* eerst opmeten met het object nog op identiteit, dan passen op wat er
       daadwerkelijk gemeten is: de opgemeten box is de enige die klopt */
    const { mesh, vertices, motion, box, speeds, spans } = measureSurface(object, clip)
    fitToBox(object, box, orient)

    const picked = pickStirPoints(motion, stirPoints)
    return {
      object,
      speeds,
      spans,
      surface: { mesh, vertices: picked.map((slot) => vertices[slot]), rig: readRig(object) },
    }
  }, [
    scene,
    animations,
    uniforms,
    /* met opzet niet de hele config: dit bouwt het model opnieuw op en meet het
       oppervlak door de hele clip heen, en dat is het duurste wat hier gebeurt.
       De belichting hangt er daarom buiten en wordt los bijgesteld. */
    color,
    length,
    stirPoints,
    flipped,
    spin,
  ])

  /* De matcap erop hangen. Staat los van de opbouw hierboven zodat een draai aan
     de belichting het model niet opnieuw laat meten. */
  useEffect(() => {
    prepared.object.traverse((child) => {
      if (child instanceof Mesh) (child.material as MeshMatcapMaterial).matcap = matcap
    })
  }, [prepared, matcap])

  const { actions, names, mixer } = useAnimations(animations, prepared.object)

  useEffect(() => {
    const first = names[0] ? actions[names[0]] : null
    first?.reset().play()
    return () => {
      first?.stop()
    }
  }, [actions, names])

  /* De klok van de clip, en die loopt op twee manieren ongelijkmatig.

     Binnen een slag: langzaam waar de vleugels langzaam bewegen, snel waar ze
     snel bewegen. Zo blijven de vleugels langer gespreid en gaat hij er in één
     keer doorheen, zonder dat er één bot verandert. Zie beat.ts; op glideHold 0
     valt dat terug op een gelijkmatige klok.

     Over de slagen heen: `beating` zegt of hij de vleugels nodig heeft om
     vooruit te komen. De slag houdt daarbij zijn eigen tempo — de hele clip
     vertragen zag eruit als doorklapwieken in slow motion, en dat is niet
     hetzelfde als ophouden met slaan. Hoeft hij niet vooruit, dan maakt hij de
     slag waar hij in zit gewoon af en komt pas in de laatste aanloop tot
     stilstand, in de eerstvolgende stand waar de vleugels het verst gespreid
     staan — er zijn er vier in deze clip, één per slag, dus hij wacht hooguit
     één slag. Gaat het slaan weer aan, dan loopt hij vanaf diezelfde plek
     verder.

     Pauze en prefers-reduced-motion zetten de animatie helemaal stil. */
  const profile = useMemo(
    () => beatProfile(prepared.speeds, config.glideHold),
    [prepared.speeds, config.glideHold],
  )
  const soars = useMemo(() => soarPhases(prepared.speeds), [prepared.speeds])
  /* de stand waarin de vleugels tegen het lijf liggen; daar remt hij op af als
     hij duikt, in plaats van op de gespreide zweefstand */
  const folded = useMemo(() => [foldPhase(prepared.spans)], [prepared.spans])
  const lastPhase = useRef<number | null>(null)

  useFrame(() => {
    if (frozen) {
      mixer.timeScale = 0
      return
    }
    const action = names[0] ? actions[names[0]] : null
    const duration = action?.getClip().duration ?? 0
    if (!action || duration <= 0) {
      mixer.timeScale = 1
      return
    }

    const phase = action.time / duration
    const holding = folding?.current === true

    /* Hele vleugelslagen tellen, zodat de duik op een slaggrens kan beginnen.
       Een slag is af zodra de klok een zweefstand passeert: dat zijn precies de
       dalen tussen de slagen, en er is er per slag één. */
    if (beats && lastPhase.current !== null && !holding) {
      const advanced = ((phase - lastPhase.current) % 1 + 1) % 1
      if (advanced > 0 && advanced < 0.5) {
        for (const soar of soars) {
          const since = ((soar - lastPhase.current) % 1 + 1) % 1
          if (since > 0 && since <= advanced) beats.current += 1
        }
      }
    }
    lastPhase.current = phase

    mixer.timeScale = clipRate(
      profile,
      holding ? folded : soars,
      phase,
      holding ? 0 : beating?.current ?? 1,
      config.soarBrake,
    )
  })

  useEffect(() => {
    onStirSurface(prepared.surface)
    return () => onStirSurface({ mesh: null, vertices: [], rig: null })
  }, [prepared, onStirSurface])

  return <primitive object={prepared.object} />
}

/** een model dat niet laadt mag de scene niet meeslepen */
class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[FluidScene] model kon niet geladen worden, terug naar de bol', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

type FloatingObjectProps = {
  config: ObjectConfig
  modelUrl?: string
  frozen: boolean
  beating?: React.RefObject<number>
  /** telt hele vleugelslagen op; dive.ts telt daarmee af */
  beats?: React.RefObject<number>
  /** vleugels ingeklapt houden in plaats van gespreid, tijdens de duik */
  folding?: React.RefObject<boolean>
  onStirSurface: (surface: StirSurface) => void
}

const FloatingObject = forwardRef<Group, FloatingObjectProps>(
  ({ config, modelUrl, frozen, beating, beats, folding, onStirSurface }, ref) => {
    const fallback = <Sphere config={config} />

    return (
      <group ref={ref}>
        {modelUrl ? (
          <ModelBoundary fallback={fallback}>
            <Suspense fallback={fallback}>
              <Model
                url={modelUrl}
                config={config}
                frozen={frozen}
                beating={beating}
                beats={beats}
                folding={folding}
                onStirSurface={onStirSurface}
              />
            </Suspense>
          </ModelBoundary>
        ) : (
          fallback
        )}
      </group>
    )
  },
)

FloatingObject.displayName = 'FloatingObject'

export default FloatingObject
