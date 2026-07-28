/**
 * Maakt van een zware Sketchfab-export een glb die je op het web kunt serveren.
 *
 * Gebruik:
 *   node scripts/optimize-model.mjs <input.gltf|glb> <output.glb>
 *
 * De scene rendert unlit: FloatingObject vervangt elk materiaal door een
 * MeshBasicMaterial met alleen de diffuse map. Alles wat daar niet aan
 * bijdraagt is dood gewicht en gaat eruit. Dat is geen algemene glb-optimizer
 * maar precies de goede aanname voor deze scene.
 */

import { readFileSync, statSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions'
import {
  dedup,
  meshopt,
  metalRough,
  prune,
  resample,
  sortPrimitiveWeights,
  textureCompress,
  weld,
} from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'

const TEXTURE_SIZE = 1024

/**
 * Hoe ver een keyframe van de lijn tussen zijn buren mag liggen voordat hij
 * blijft staan. De Sketchfab-export bakt 30 keyframes per seconde plat, ook waar
 * niets beweegt, dus hier valt veel weg.
 *
 * Deze waarde is opgemeten, niet gegokt, want daar ging het eerder mis. Gemeten
 * als de hoekafwijking van elke botrotatie tegenover het origineel, over de hele
 * clip op 120 Hz:
 *
 *   1e-4  60.284 keyframes  730 kB  mediaan 0,03deg  p90 0,10deg  ergste 0,31deg
 *   1e-3  24.144 keyframes  587 kB  mediaan 0,53deg  p90 1,35deg  ergste 3,27deg
 *   5e-3  11.257 keyframes  506 kB  mediaan 3,18deg  p90 6,88deg  ergste 13,41deg
 *
 * Bij 5e-3 bleven staartbotten op twee keyframes over de hele clip staan: de
 * staartbeweging werd een rechte lijn en dat zag je. 1e-4 kost 224 kB meer dan
 * 5e-3 en is de dertigduizend keyframes waard.
 */
const RESAMPLE_TOLERANCE = 1e-4

const input = resolve(process.argv[2] ?? 'C:/Users/arthu/Werk/pendra.labs/immersive/dragon_flying/scene.gltf')
const output = resolve(process.argv[3] ?? 'public/models/dragon-flying.glb')

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`

/** de gltf plus alles waar hij naar wijst, want een gltf alleen zegt niks */
const sourceBytes = (path) => {
  const json = JSON.parse(readFileSync(path, 'utf8'))
  const base = dirname(path)
  const uris = [
    ...(json.buffers ?? []).map((b) => b.uri),
    ...(json.images ?? []).map((i) => i.uri),
  ].filter((uri) => uri && !uri.startsWith('data:'))

  return uris.reduce(
    (total, uri) => total + statSync(resolve(base, decodeURIComponent(uri))).size,
    statSync(path).size,
  )
}

await MeshoptEncoder.ready

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
})

const document = await io.read(input)
const root = document.getRoot()

const before = input.endsWith('.gltf') ? sourceBytes(input) : statSync(input).size
const animation = root.listAnimations()[0]
const keyframesBefore = animation
  ? animation.listSamplers().reduce((total, s) => total + (s.getInput()?.getCount() ?? 0), 0)
  : 0

/* Sketchfab exporteert specular-glossiness. three.js heeft die extensie laten
   vallen, dus zonder deze stap laadt het model wel maar blijft de textuur weg. */
await document.transform(metalRough())

/* Normal en occlusion worden door een unlit render nooit gelezen. Losknippen
   hier, prune ruimt de textures daarna op. */
for (const material of root.listMaterials()) {
  material
    .setNormalTexture(null)
    .setOcclusionTexture(null)
    .setEmissiveTexture(null)
    .setMetallicRoughnessTexture(null)
}

/* Als unlit vastgelegd, zodat prune weet dat NORMAL en TANGENT weg mogen en
   een andere loader het model ook zonder licht correct toont. */
const unlit = document.createExtension(KHRMaterialsUnlit)
for (const material of root.listMaterials()) {
  material.setExtension('KHR_materials_unlit', unlit.createUnlit())
  /* metalRough laat deze twee achter; op een unlit materiaal doen ze niets */
  material.setExtension('KHR_materials_ior', null)
  material.setExtension('KHR_materials_specular', null)
}

/* de zwaarste bot per vertex vooraan, zodat de weights niet stukgaan als
   meshopt ze straks naar 8 bit terugbrengt */
for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    if (primitive.getAttribute('WEIGHTS_0')) sortPrimitiveWeights(primitive)
  }
}

await document.transform(
  /* de Sketchfab-export bakt elke frame plat; resample gooit alles weg wat op
     de lijn tussen zijn buren ligt */
  resample({ tolerance: RESAMPLE_TOLERANCE }),

  weld(),

  /* keepAttributes: false laat de vier identieke extra UV-sets, TANGENT en
     NORMAL vallen, want geen enkel materiaal vraagt er nog om */
  prune({ keepAttributes: false, keepIndices: false, keepLeaves: false }),
  dedup(),

  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [TEXTURE_SIZE, TEXTURE_SIZE],
  }),

  /* quantize zit in meshopt ingebakken. 'high' scheelt hier 423 kB tegenover
     'medium' en kost aan rotatiefout niets meetbaars: bij dezelfde tolerantie
     bleven mediaan, p90 en ergste gelijk tot op twee decimalen. */
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
)

mkdirSync(dirname(output), { recursive: true })
await io.write(output, document)

const after = statSync(output).size
const keyframesAfter = root
  .listAnimations()[0]
  ?.listSamplers()
  .reduce((total, s) => total + (s.getInput()?.getCount() ?? 0), 0)

console.log(`in   ${kb(before)}  ${input}`)
console.log(`uit  ${kb(after)}  ${output}`)
console.log(`     ${(100 - (after / before) * 100).toFixed(1)}% kleiner`)
if (keyframesBefore) console.log(`     keyframes ${keyframesBefore} -> ${keyframesAfter}`)
console.log(
  `     meshes ${root.listMeshes().length}, materialen ${root.listMaterials().length}, textures ${root.listTextures().length}`,
)
