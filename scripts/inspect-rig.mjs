/**
 * Leest het skelet van een glb uit en meet op waar de ketens naartoe wijzen.
 *
 * Een procedurele laag bovenop een clip moet weten om welke as hij een bot moet
 * draaien, en dat staat nergens in het bestand. Een rigger kiest die assen zelf,
 * en bij dit model wijst de x-as van een staartbot niet naar de volgende schakel
 * maar ergens anders heen. Gokken kost een middag; opmeten kost deze aanroep.
 *
 * De code die dit in de browser gebruikt rekent hetzelfde zelf uit, zodat er
 * geen getallen uit dit script in de broncode belanden. Dit is om te kijken, om
 * een nieuw model te controleren, en om te zien of de aanname klopt voordat je
 * hem in een frame-loop zet.
 *
 *   node scripts/inspect-rig.mjs public/models/dragon-flying.glb
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { Matrix4, Quaternion, Vector3 } from 'three'

const file = process.argv[2] ?? 'public/models/dragon-flying.glb'

/** de suffix die de exporteur aan elke botnaam plakt */
const clean = (name) => (name ?? '').replace(/\.\d+_\d+_\d+$/, '')

/** de ketens waar een procedurele laag iets aan heeft */
const CHAINS = [
  { name: 'tail', match: /^tail_\d+$/ },
  { name: 'neck', match: /^neck_\d+$/ },
  { name: 'spine', match: /^spine_\d+$/ },
]

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
io.registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

const document = await io.read(file)
const root = document.getRoot()

/* de wereldmatrix van elk bot in de ruststand, door de boom af te lopen */
const world = new Map()
const parent = new Map()

const walk = (node, parentMatrix) => {
  const local = new Matrix4().compose(
    new Vector3(...node.getTranslation()),
    new Quaternion(...node.getRotation()),
    new Vector3(...node.getScale()),
  )
  const matrix = new Matrix4().multiplyMatrices(parentMatrix, local)
  world.set(clean(node.getName()), matrix)
  for (const child of node.listChildren()) {
    parent.set(clean(child.getName()), clean(node.getName()))
    walk(child, matrix)
  }
}

for (const scene of root.listScenes()) {
  for (const node of scene.listChildren()) walk(node, new Matrix4())
}

const joints = root
  .listSkins()
  .flatMap((skin) => skin.listJoints())
  .map((joint) => clean(joint.getName()))

/* welke botten de clip zelf al aanstuurt; wat daar niet in staat is vrij */
const animated = new Set()
for (const animation of root.listAnimations()) {
  for (const channel of animation.listChannels()) {
    animated.add(clean(channel.getTargetNode()?.getName()))
  }
}

const UP = new Vector3(0, 1, 0)
const degrees = (radians) => (radians * 180) / Math.PI

console.log(`${file}\n${joints.length} botten, ${animated.size} daarvan in de clip\n`)

for (const chain of CHAINS) {
  const bones = joints.filter((name) => chain.match.test(name))
  if (bones.length === 0) continue

  console.log(`## ${chain.name} — ${bones.length} schakels`)
  console.log('bot        lengte   lokale as voor zwaai op het scherm   hoek met de keten')

  for (const name of bones) {
    const matrix = world.get(name)
    if (!matrix) continue

    const rotation = new Quaternion().setFromRotationMatrix(matrix)

    /* De camera kijkt langs de wereld-y omlaag, dus een draai om die as is wat
       je op het scherm als zwaaien ziet. Welke lokale as dat is verschilt per
       bot, want elke schakel staat anders gedraaid. */
    const sway = UP.clone().applyQuaternion(rotation.clone().invert()).normalize()

    /* de richting naar de volgende schakel, in de eigen ruimte van dit bot:
       daar loopt de keten langs, en daar hoort de zwaai-as loodrecht op te staan */
    const child = bones.find((other) => parent.get(other) === name)
    const along = child
      ? new Vector3()
          .setFromMatrixPosition(world.get(child))
          .sub(new Vector3().setFromMatrixPosition(matrix))
      : null
    const length = along ? along.length() : 0
    const localAlong = along
      ? along.clone().applyQuaternion(rotation.clone().invert()).normalize()
      : null

    const axis = `${sway.x.toFixed(2).padStart(6)} ${sway.y.toFixed(2).padStart(6)} ${sway.z.toFixed(2).padStart(6)}`
    const angle = localAlong ? `${degrees(localAlong.angleTo(sway)).toFixed(1)}°` : '—'

    console.log(`${name.padEnd(10)} ${length.toFixed(3).padStart(6)}   ${axis}              ${angle.padStart(7)}`)
  }
  console.log()
}
