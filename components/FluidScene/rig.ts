import { Matrix4, Quaternion, Vector3, type Bone, type SkinnedMesh } from 'three'

/**
 * De botketens van een model opzoeken, zodat er per frame een eigen laag
 * bovenop de clip geschreven kan worden.
 *
 * Waarom bovenop en niet in plaats van. De draak brengt een rig van 221 botten
 * mee waar 216 van in de clip zitten, met vleugelvliezen die aan de vingers
 * hangen. Dat met de hand naschrijven levert een slechtere vliegcyclus op dan
 * er nu staat. Maar de ketens ernaast — dertig staartschakels, elf nekschakels,
 * acht rugschakels — zijn precies waar code wél sterker is dan een vaste clip,
 * want daar wil je variatie en reactie op wat er in de scene gebeurt.
 *
 * De mixer schrijft elke frame de hele botstand opnieuw. Een draai die je daarna
 * op een bot vermenigvuldigt stapelt dus niet op maar geldt precies één frame,
 * en dat is exact wat een laag hoort te doen. Voorwaarde is alleen dat het ná de
 * mixer en vóór `updateMatrixWorld` gebeurt.
 *
 * ## Om welke as
 *
 * Dat staat nergens in een glb: een rigger kiest de assen zelf. Bij deze draak
 * loopt de lokale y van elk bot met de wereld-op mee, in alle drie de ketens,
 * maar dat is geluk en geen wet. Daarom wordt het opgemeten in plaats van
 * ingetypt, uit de inverse bind matrices — die geven de ruststand van elk bot,
 * los van waar de clip hem op dit moment heeft staan.
 *
 * `scripts/inspect-rig.mjs` rekent hetzelfde offline uit, om een nieuw model
 * langs te leggen voordat je het in een frame-loop zet.
 */
export type BoneChain = {
  /** de schakels op volgorde, van basis naar punt */
  bones: Bone[]
  /** per schakel de lokale as waar een draai om op het scherm als zwaaien leest */
  axes: Vector3[]
}

export type ModelRig = {
  tail: BoneChain | null
  neck: BoneChain | null
  /** de twee vleugels, van schouder naar hand; voor de zweeflaag */
  wings: BoneChain[]
}

/** het stukje `Bone` dat `orderChain` nodig heeft, zodat die zonder three te testen is */
export type ChainNode = { name: string; parent: ChainNode | null; children: ChainNode[] }

/**
 * Of een bot bij een keten hoort.
 *
 * Alleen op het begin van de naam, en dat is met opzet, want het einde is niet
 * te vertrouwen. In het glb heet een bot `tail_07.189_189_192`, maar three.js
 * haalt bij het inladen de punt eruit — `PropertyBinding.sanitizeNodeName`
 * schrapt `[ ] . : /` — en dan staat er `tail_07189_189_192`. Uit dát getal is
 * niet meer te zien of het bot 07, 071 of 0718 is. De volgorde komt daarom uit
 * de keten zelf, zie `orderChain`.
 *
 * De cijfer-eis na het streepje doet het echte werk: deze draak heeft naast
 * `tail_01..30` ook `tailSpike` en `tailBaseSpike`, en naast `neck_01..11` nog
 * veertien `neckSpike`-botten. Die stekels hangen aan de keten en gaan vanzelf
 * mee; draai je ze ook los, dan waaieren ze uit.
 */
export const isChainBone = (name: string, prefix: string): boolean =>
  new RegExp(`^${prefix}_\\d`).test(name)

/**
 * De schakels op volgorde van de keten, van basis naar punt.
 *
 * Via de ouder-kindrelatie en niet via de naam: de basis is de schakel wiens
 * ouder er niet bij hoort, en daarna volg je het kind dat er wél bij hoort.
 * Klopt de keten niet — een vertakking, een gat — dan komt er minder uit dan
 * erin ging en valt de laag vanzelf stil in plaats van halve botten te draaien.
 */
export const orderChain = <T extends { name: string; parent: T | null; children: T[] }>(
  bones: T[],
  prefix: string,
): T[] => {
  const members = new Set(bones.filter((bone) => isChainBone(bone.name, prefix)))
  if (members.size === 0) return []

  const root = [...members].find((bone) => !bone.parent || !members.has(bone.parent))
  if (!root) return []

  const chain: T[] = []
  let current: T | undefined = root
  while (current && chain.length <= members.size) {
    chain.push(current)
    current = current.children.find((child) => members.has(child))
  }

  return chain
}

/** de as waar de camera langs kijkt; een draai hierom leest als zwaaien */
const UP = new Vector3(0, 1, 0)

/** de botten van een vleugel, van binnen naar buiten */
const WING_BONES = ['shoulder', 'forearm', 'hand']

const findChain = (mesh: SkinnedMesh, prefix: string): BoneChain | null => {
  const { bones, boneInverses } = mesh.skeleton
  const chain = orderChain(bones as unknown as ChainNode[], prefix)
  const order = chain.map((bone) => bones.indexOf(bone as unknown as Bone))

  if (order.length < 2 || order.some((index) => index < 0)) return null

  const scratch = new Matrix4()
  const rotation = new Quaternion()

  const axes = order.map((index) => {
    /* de bind matrix zet van de ruimte van de mesh naar die van het bot; andersom
       is dus de ruststand van het bot zelf */
    scratch.copy(boneInverses[index]).invert()
    rotation.setFromRotationMatrix(scratch)
    return UP.clone().applyQuaternion(rotation.invert()).normalize()
  })

  return { bones: order.map((index) => bones[index]), axes }
}

/**
 * De ruststand van een bot, uit de inverse bind matrix: die zet van de ruimte van
 * de mesh naar die van het bot, dus andersom is het bot zelf.
 */
const restRotation = (mesh: SkinnedMesh, index: number) =>
  new Quaternion().setFromRotationMatrix(
    new Matrix4().copy(mesh.skeleton.boneInverses[index]).invert(),
  )

const restPosition = (mesh: SkinnedMesh, index: number) =>
  new Vector3().setFromMatrixPosition(
    new Matrix4().copy(mesh.skeleton.boneInverses[index]).invert(),
  )

/**
 * Een bot bij naam, met de nummering die three.js eraan plakt.
 *
 * Op het naampad na exact, en dan moet er een cijfer volgen of niets. Zonder die
 * eis pakt `l_shoulder` ook `l_shoulderTwist` mee, want die begint er net zo goed
 * mee — en dan draait de zweeflaag een bot mee die er niet bij hoort.
 */
export const isBone = (name: string, exact: string): boolean =>
  name === exact || (name.startsWith(exact) && /\d/.test(name.charAt(exact.length)))

const indexOfBone = (mesh: SkinnedMesh, name: string) =>
  mesh.skeleton.bones.findIndex((bone) => isBone(bone.name, name))

/**
 * De lijfas in de ruststand: van de staartwortel naar de nekwortel.
 *
 * Daar draait een vleugel omheen als hij op en neer gaat. Opgemeten en niet
 * ingetypt, om dezelfde reden als bij de ketens: welke as dat is kiest de rigger.
 * Bij deze draak is het de wereld-z, en de lokale as van elk vleugelbot ligt daar
 * netjes mee op één lijn — maar dat is geluk en geen wet.
 *
 * De twee uiteinden komen uit de ketens die al gevonden zijn en niet uit een
 * naamzoekopdracht, want die ketens weten zelf al waar hun wortel zit.
 */
const bodyAxis = (mesh: SkinnedMesh, tail: BoneChain | null, neck: BoneChain | null): Vector3 => {
  const fallback = new Vector3(0, 0, 1)
  if (!tail || !neck) return fallback

  const at = (bone: Bone) => {
    const index = mesh.skeleton.bones.indexOf(bone)
    return index >= 0 ? restPosition(mesh, index) : null
  }

  const from = at(tail.bones[0])
  const to = at(neck.bones[0])
  if (!from || !to) return fallback

  const along = to.sub(from)
  return along.lengthSq() > 1e-12 ? along.normalize() : fallback
}

/**
 * Eén vleugel: schouder, onderarm, hand, met per bot de lokale as waar een draai
 * omheen de vleugel doet stijgen of dalen.
 */
const findWing = (mesh: SkinnedMesh, side: string, axis: Vector3): BoneChain | null => {
  const found = WING_BONES.map((part) => indexOfBone(mesh, `${side}_${part}`)).filter(
    (index) => index >= 0,
  )
  if (found.length < 2) return null

  return {
    bones: found.map((index) => mesh.skeleton.bones[index]),
    axes: found.map((index) =>
      axis.clone().applyQuaternion(restRotation(mesh, index).invert()).normalize(),
    ),
  }
}

const findSkinnedMesh = (root: import('three').Object3D): SkinnedMesh | null => {
  let found: SkinnedMesh | null = null
  root.traverse((child) => {
    if (!found && (child as SkinnedMesh).isSkinnedMesh) found = child as SkinnedMesh
  })
  return found
}

export const readRig = (root: import('three').Object3D): ModelRig => {
  const mesh = findSkinnedMesh(root)
  if (!mesh) return { tail: null, neck: null, wings: [] }

  const tail = findChain(mesh, 'tail')
  const neck = findChain(mesh, 'neck')
  const axis = bodyAxis(mesh, tail, neck)

  return {
    tail,
    neck,
    wings: ['l', 'r']
      .map((side) => findWing(mesh, side, axis))
      .filter((wing): wing is BoneChain => wing !== null),
  }
}
