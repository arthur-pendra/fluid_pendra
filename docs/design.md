# Fluid scene — ontwerp

Datum: 27 juli 2026. Status: gebouwd en draaiend.

## Waar dit vandaan komt

De projectpagina van immersive-g.com heeft een achtergrond die eruitziet als
water, maar dat is het niet. De opbouw daar is:

1. een object wordt naar een eigen render target getekend, op een vlakke
   achtergrondkleur;
2. een GPGPU-vloeistofsimulatie wordt beroerd door de cursor en door zeven
   punten langs dat object;
3. een schermvullende pass toont het render target alleen daar waar de
   vloeistof beweegt, met de uv verbogen langs het snelheidsveld.

Het zachte, waterige uitsmeren komt dus uit de vloeistof, niet uit een
wateroppervlak. Dit project bouwt datzelfde systeem opnieuw op in Next.js met
React Three Fiber, met eigen shaders en eigen knoppen.

## Besluiten

| Vraag | Keuze |
|---|---|
| Gelijkenis met het origineel | zelfde opbouw, eigen shaders, look in dezelfde geest en niet pixel voor pixel |
| 3D-laag | R3F declaratief, imperatief alleen waar de rendervolgorde dat vraagt |
| Vorm van het product | Next.js-project met de scene als kopieerbare map |
| Gedrag van het object | volgt de cursor, klik stuurt het er direct heen |
| Afstellen | Leva, alleen tijdens ontwikkelen |

## Architectuur

```
app/page.tsx                    demo, laadt de scene client-only
components/FluidScene/          deze map kopieer je naar andere projecten
  index.tsx                     <FluidScene />, de enige publieke ingang
  FluidRig.tsx                  rendervolgorde en alle toestand per frame
  FloatingObject.tsx            model of ingebouwde bol, unlit gemaakt
  useFluidSimulation.ts         ping-pong buffers en de simulatiestap
  objectMotion.ts               gedrag van het object, pure functies
  projection.ts                 scherm, uv en het vlak, pure functies
  pointer.ts                    cursorstand buiten React om
  config.ts                     alle knoppen
  shaders/                      fullscreen, simulation, painting
components/DebugPanel/          Leva, buiten de scene-map gehouden
```

De hele keten draait in één `<Canvas>`. Door `useFrame` met `priority` 1 te
gebruiken zet R3F zijn automatische render uit en bepalen wij de volgorde:

1. object naar zijn render target, met een eigen camera die recht naar beneden
   kijkt;
2. penseelinvoer bijwerken: cursor plus zeven punten langs het object, naar uv
   geprojecteerd, met hun verplaatsing van dit frame;
3. simulatiestap: ping-pong tussen twee half-float buffers op halve resolutie;
4. eindpass naar het scherm.

De offscreen scene komt van `createPortal`, de buffers van `useFBO`. De
simulatiepass is bewust imperatief: een scene met één vlak van 2 bij 2 en een
vertex shader die de camera negeert.

## De oplosser

Zes passes per frame, op een vaste tijdstap van 0,008:

1. **penselen** zetten kracht in het veld, als capsule tussen vorige en
   huidige positie met aan beide uiteinden een eigen straal. Bij een klik
   schrijft het penseel een naar buiten lopende golf.
2. **advectie** sleept het veld mee, met BFECC-foutcorrectie zodat wervels
   scherp blijven, en met ruis die de stroming stuurt en in gaten laat vallen.
3. **divergentie** meet waar het veld uit elkaar loopt.
4. **druk**, vier Jacobi-iteraties.
5. **gradiëntaftrek** haalt de druk er weer af; wat overblijft wervelt.
6. **accumulatie** onthoudt waar de stroming geweest is en laat dat langzaam
   wegsterven. Dit is de textuur die getekend wordt.

De drukprojectie is het deel dat het verschil maakt. Zonder die stappen krijg
je uitdijende vlekken in plaats van wervels: dat was de eerste versie van dit
project, en het voelde meteen anders dan het origineel.

De parameters zijn overgenomen uit de scene van Immersive Garden en staan in
`config.ts`. De code is van ons, de afstelling is van hen. Het gaat om
deceleration 0,95, attenuation 0,999, vier drukiteraties, ruisrichting 0,5,
drempel 0,163 en gaten tussen 0,435 en 0,516.

## Twee dingen die tijdens het bouwen zijn bijgesteld

**NaN in een verse buffer.** Een pas aangemaakte half-float render target is
niet leeg maar ongedefinieerd, en die rommel kan NaN zijn. Eén NaN in het
snelheidsveld maakt de advectiecoördinaat ook NaN, en dan geeft elke uitlezing
nul terug: het veld stapelt nooit op en je ziet alleen de stempel van het
huidige frame. Alle buffers worden nu bij de eerste stap expliciet met een
eigen pass op nul gezet. Dit kostte de meeste tijd van de hele bouw en is
precies het soort fout dat er niet uitziet als een fout: alles rekent door, er
staat alleen niets op het scherm.

**De koppeling tussen penseel en oplosser is gevoelig.** Onze penselen rekenen
in uv-verplaatsing per frame, het origineel in zijn eigen krachtschaal.
`cursorForce` en `objectForce` overbruggen dat verschil, en het venster tussen
"niets te zien" en "veld verzadigt en het beeld slaat door" is smal. Die twee
staan daarom in het paneel onder "stroming".

## Randgevallen

Geen WebGL geeft een stille terugval naar de achtergrondkleur. Reduced motion
bevriest de simulatie. Een model dat niet laadt valt terug op de bol met een
waarschuwing. Tab verborgen pauzeert, en de delta wordt afgekapt zodat de
simulatie bij terugkomst niet opspringt. Resize schaalt de buffers mee met een
dpr-plafond van 1,5.

## Testen

De rekenkundige kern is puur en heeft unit tests: het objectgedrag (doel
volgen, drift, de lijn met roerpunten) en de projectie (scherm naar uv naar
vlak). Vijftien tests, `npm test`. Het beeld zelf wordt niet automatisch
getest.

## Wat er bewust niet in zit

Geen audio, geen loader, geen paginatransities, geen postprocessing, geen
aparte mobiele profielen.
