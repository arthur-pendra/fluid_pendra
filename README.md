# Fluid scene

Een 3D-object dat je alleen ziet waar de vloeistof beweegt. Het object volgt je
cursor, een klik stuurt het er direct heen met een kleurimpuls.

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

Het component luistert alleen op zijn eigen element, kaapt de scroll niet en
zet niets op `window`.

## Je eigen model erin

Exporteer als glb: één mesh, geen camera's, geen lichten, geen animaties. Zet
het bestand in `public/models/` en wijs `modelUrl` ernaar. Schaal en middelpunt
worden automatisch gecorrigeerd, en een gewoon PBR-materiaal wordt omgezet naar
vlakke weergave, want de scene heeft geen lichtbronnen.

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
