# Fluid scene

Een 3D-object dat je alleen ziet waar de vloeistof beweegt. Een geanimeerd model
vliegt zelf en roert zichzelf zichtbaar; een stil model volgt je cursor. Een klik
doet standaard niets; `clickImpulse` zet er een golf en een nieuwe kleurfase op.

Next.js 16, React Three Fiber, TypeScript, CSS Modules.

```bash
npm install
npm run dev     # http://localhost:3003
npm test        # unit tests op de rekenkern
npm run build
```

## Het component gebruiken

De map `components/FluidScene/` is zelfstandig: kopieer hem naar een ander
project, zorg dat `three`, `@react-three/fiber` en `@react-three/drei`
geïnstalleerd zijn, en gebruik hem zo:

```tsx
'use client'
import dynamic from 'next/dynamic'

const FluidScene = dynamic(() => import('@/components/FluidScene'), { ssr: false })

<FluidScene className={styles.scene} modelUrl="/models/mijn-model.glb" />
```

`ssr: false` is nodig: de scene raakt WebGL aan en mag niet op de server
draaien. Geef de ouder een hoogte, het component vult die volledig.

Props: `modelUrl` (optioneel, zonder dit verschijnt een bol), `className`,
`paused`, `config`.

Brengt het model een animatie mee, dan draait die, en dan blijft het object in
het midden staan: de roerpunten hangen dan aan de plekken op zijn eigen
oppervlak die het hardst bewegen, dus het onthult zichzelf. Een stil model of de
ingebouwde bol volgt de cursor en drijft rond, want anders valt het weg. Dat
kiest het component zelf.

Het component luistert alleen op zijn eigen element, kaapt de scroll niet en
zet niets op `window`.

## Je eigen model erin

Exporteer als glb: één mesh, geen camera's, geen lichten. Een skinned mesh met
animatie mag, de eerste clip wordt afgespeeld. Zet het bestand in
`public/models/` en wijs `modelUrl` ernaar. Schaal en middelpunt worden
automatisch gecorrigeerd, en een gewoon PBR-materiaal wordt omgezet naar vlakke
weergave, want de scene heeft geen lichtbronnen.

De camera kijkt recht naar beneden op het object, en welke kant je dan ziet hangt
aan het model. Twee knoppen daarvoor: `object.flipped` draait het model een halve
slag zodat je de andere kant ziet, en `object.spin` draait in het beeldvlak, in
graden, zodat de kop de kant op wijst die je wil.

## Een model webklaar maken

```bash
node scripts/optimize-model.mjs <bron.gltf|glb> <doel.glb>
```

Draait op de aannames van deze scene, en dat scheelt veel. De render is unlit, dus
normal, occlusion, TANGENT en NORMAL gaan eruit. Extra UV-sets die identiek zijn
aan de eerste gaan eruit. Keyframes worden geresampled, want exports uit Sketchfab
bakken dertig frames per seconde plat, ook waar niets beweegt. De textuur gaat naar
WebP op 1024, en het geheel wordt met meshopt gecomprimeerd.

De draak in deze repo ging van 14,1 MB naar 730 kB, met 60.284 keyframes over van
de 146.317. Meshopt en niet Draco, zodat de decoder uit je eigen bundel komt in
plaats van van een CDN. `KHR_materials_pbrSpecularGlossiness` wordt omgezet naar
metal-roughness: three.js heeft die extensie laten vallen, dus zonder die stap
laadt een Sketchfab-model wel maar blijft de textuur weg.

De resample-tolerantie is opgemeten en niet gegokt, want daar ging het eerst mis:
te ver doorgezet bleven staartbotten op twee keyframes over de hele clip staan en
werd de staartbeweging een rechte lijn. De afweging staat in het script.

## Afstellen

Alle knoppen staan in `components/FluidScene/config.ts`, met commentaar per
waarde. Tijdens `npm run dev` verschijnt rechtsboven een Leva-paneel waarmee je
de belangrijkste live kunt bijdraaien; de waarden die je daar vindt zet je
daarna in `config.ts`. In de productiebuild wordt dat paneel niet geladen.

Twee knoppen die je waarschijnlijk als eerste wilt:

- `object.driftRadius` en `driftSpeed`: hoe hard het object de vloeistof
  beroert. Op nul valt het stil en verdwijnt het uit beeld, want het is alleen
  zichtbaar waar de vloeistof beweegt.
- `painting.revealByInk` en `simulation.inkDeposit`: hoe sterk en hoe lang het
  object doorschijnt.

Achtergrond en werking: `docs/design.md`.
