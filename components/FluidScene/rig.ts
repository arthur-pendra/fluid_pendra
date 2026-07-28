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
 * ## Om welke as, en waarom dat per frame moet
 *
 * De as staat in wereldruimte: omhoog voor de ketens, want een draai daaromheen
 * leest van bovenaf als zwaaien, en de lijfas voor de vleugels, want daaromheen
 * stijgen en dalen ze.
 *
 * Die as moet per frame naar de eigen ruimte van het bot worden omgerekend, en
 * niet één keer uit de bindstand. Dat laatste stond er eerst, en het is stil fout
 * gegaan: een draai die je op `bone.quaternion` vermenigvuldigt geldt in het
 * frame van het bot zoals de clip het op dát moment heeft staan, niet zoals het
 * in de bindstand stond. Draaien de ouders mee, dan wijst een as uit de
 * bindstand ergens anders heen.
 *
 * Bij deze draak loopt dat flink weg. Opgemeten over de clip staat een as uit de
 * bindstand tot 66 graden scheef op de staart, 78 op de nek en 45 op de
 * vleugels. Bij die hoeken is een zwaai voor een groot deel een draai om de
 * staart-as zelf geworden, en dat ziet eruit als een staart die ronddraait in
 * plaats van uitslaat. Per frame omgerekend is die afwijking nul, en verzet de
 * laag de staartpunt volledig zijwaarts in plaats van voor negentig procent.
 *
 * `scripts/inspect-rig.mjs` rekent de bindstand offline uit, om een nieuw model
 * langs te leggen voordat je het in een frame-loop zet.
 */
export type BoneChain = {
  /** de schakels op volgorde, van basis naar punt */
  bones: Bone[]
  /** de as in wereldruimte waar een draai omheen het gewenste effect geeft */
  axis: Vector3
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
  const chain = orderChain(mesh.skeleton.bones as unknown as ChainNode[], prefix)
  if (chain.length < 2) return null

  return { bones: chain as unknown as Bone[], axis: UP.clone() }
}

/* hergebruikt bij het omrekenen, zodat er per frame niets gealloceerd wordt */
const scratchPosition = new Vector3()
const scratchRotation = new Quaternion()
const scratchScale = new Vector3()

/**
 * Een as uit wereldruimte naar de eigen ruimte van een bot, zoals het er op dit
 * moment bij staat.
 *
 * Werkt op `matrixWorld`, dus de aanroeper moet die eerst hebben bijgewerkt.
 * Ontleden en niet zomaar de rotatie uit de matrix lezen: het model is geschaald,
 * en `setFromRotationMatrix` gaat uit van een matrix zonder schaal.
 */
export const localAxis = (bone: Bone, worldAxis: Vector3, target: Vector3): Vector3 => {
  bone.matrixWorld.decompose(scratchPosition, scratchRotation, scratchScale)
  return target.copy(worldAxis).applyQuaternion(scratchRotation.invert()).normalize()
}

/**
 * De ruststand van een bot, uit de inverse bind matrix: die zet van de ruimte van
 * de mesh naar die van het bot, dus andersom is het bot zelf.
 */
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

  return { bones: found.map((index) => mesh.skeleton.bones[index]), axis: axis.clone() }
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
