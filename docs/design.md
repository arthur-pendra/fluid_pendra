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

## Geanimeerde modellen

Brengt een glb zijn eigen animatie mee, dan verandert er iets aan de opzet. Het
object hoeft dan niet meer rond te dwalen om zichtbaar te blijven: het roert
zichzelf. Het blijft in het midden staan en de roerpunten hangen aan plekken op
zijn eigen oppervlak, die per frame worden opgevraagd. Een vleugelpunt legt per
slag meer weg af dan het hele object in een hele driftcirkel, dus dat is een
sterkere bron dan een lijn door een stilstaand object. Volgen en drift blijven
gelden voor de bol en voor modellen zonder animatie; het component kiest zelf,
er is geen knop voor.

### De slag moet asymmetrisch zijn

Een roerpunt op een vleugel duwde eerst even hard heen als terug. Over een hele
slag heffen die twee elkaar op: het veld schudt op zijn plek en er komt geen
richting uit. Een echte vleugel doet dat niet. Op de neerslag staat hij dwars op
de lucht en duwt hij die naar achteren, op de terugslag vouwt hij zich in en
glijdt hij er zo goed als krachteloos doorheen. Dat verschil is waar
voortstuwing vandaan komt, en zonder dat verschil ziet stilstaand geklots eruit
als stilstaand geklots.

Er ligt daarom een windas over de scene, en elke slag wordt daar tegen
afgemeten. Niet als één geheel: de slag gaat uit elkaar in het deel dat langs de
as loopt en het deel dat er dwars op staat, want die twee veroorzaken twee
verschillende dingen op het scherm.

Het deel tegen de wind in breekt het spoor open. Duwt de terugslag ook maar een
beetje bovenwinds, dan loopt hij tegen het spoor van de vorige neerslag in en
wordt de wind rommelig in plaats van gericht. `strokeBias` laat die halve slag
glijden in plaats van duwen, en staat daarom hoog. De overgang tussen mee en
tegen loopt door een smalle band rond de dwarsstand, niet over de volle halve
cirkel: liep hij breed, dan bleef een schuine terugslag alsnog flink duwen, en
precies dat was de bron van de rommel. Een harde schakelaar op het teken kan ook
niet, want dan klapt een punt dat vlak langs de as veegt van frame tot frame
heen en weer.

Het deel dwars op de as laat de wind naar opzij uitwaaieren. `strokeSteering`
kamt daar een deel van weg. Helemaal dichtdraaien moet je hem niet: wat
overblijft is wat het onrustig genoeg houdt om natuurlijk te blijven, en zonder
dat doen alle roerpunten hetzelfde en komt er een rechte muur uit in plaats van
een wervel.

De slag mee wordt bewust niet versterkt: dat de wind naar achteren gaat
overheersen komt doordat al het andere wegvalt, en de totale sterkte blijft
daarmee aan `objectForce` hangen in plaats van aan twee knoppen die elkaar
tegenwerken.

De asymmetrie zit alleen op de kracht, niet op de penseelstraal en de
intensiteit: die twee blijven hangen aan hoe hard de vleugel echt beweegt, zodat
het model niet meeknippert met zijn eigen slag. Wel een gevolg om te kennen: op
`strokeBias` precies 1 zet het penseel tijdens de halve slag terug geen kracht
meer, en schrijft het dus ook geen intensiteit.

De as staat in graden op het scherm en hoort naar de staart te wijzen, dus draai
hem mee met `object.spin`. Dat is een knop en geen meting: welke kant een model
op kijkt staat nergens in een glb, en de richting waarin een vleugel het hardst
veegt is bij een symmetrische animatie niet te onderscheiden van zijn
tegengestelde.

### Stuwkracht uit de slag

De draak stond stil op de oorsprong. Nu zet elke vleugelslag hem een stukje naar
voren, tegen de windas in. Meten hoeft daar niet apart voor: voor de wind wordt
per roerpunt al uitgerekend hoeveel van zijn beweging benedenwinds gaat, en dat
signaal piekt tijdens de neerslag en valt weg tijdens de terugslag. Dezelfde
derde wet die de wind verklaart, andersom gelezen.

Bij de vis van Immersive Garden loopt dit precies omgekeerd, en dat is het
noemen waard omdat het de voor de hand liggende route is. Daar stuurt een boid
de snelheid aan en volgt de staartslag daaruit — `oscillationPower` is niets
anders dan de snelheid maal een factor, en amplitude en frequentie zijn er
remaps van. Dat kan omdat die vis procedureel buigt over drie gewrichten. Onze
draak brengt een gebakken clip mee, dus daar valt niets uit te sturen: de slag
ligt vast en de stuwkracht moet er juist uit afgeleid worden.

De eerste opzet was de natuurkundige: kracht bij een snelheid optellen,
weerstand eraf, een veer die terugtrekt naar het midden. Doorgerekend op een
slag van anderhalve hertz gaf dat 0,3% beeldhoogte aan wiebel op een uitslag van
4% — de draak ging een stukje vooruit staan en bleef daar hangen. Dat is geen
kwestie van afstellen. Massa met een veer is een laagdoorlaat van de tweede
orde, en die dempt alles boven zijn eigen frequentie met het kwadraat van de
verhouding; de slag zit daar ver boven, dus de losse duwtjes middelen uit tot
een constante verschuiving. Zichtbaar krijgen zou betekenen de veer op de
slagfrequentie afstemmen, en die staat in de clip en nergens in de code.

De uitslag volgt de slag daarom rechtstreeks, met vertraging. Dat is
frequentie-onafhankelijk: doorgerekend over 0,6 tot 3 Hz blijft de wiebel tussen
0,9% en 2,3% van de beeldhoogte, en hij loopt per slag vrijwel helemaal terug
naar nul in plaats van te blijven staan. De vertraging is wat het als duwen laat
lezen in plaats van als pulseren — zonder is de uitslag een kopie van de slag.
De uitslag kan per constructie nooit voorbij `thrustForce` komen, dus er is geen
grens nodig om de draak in beeld te houden.

De gemeten slagkracht wordt afgezet tegen zijn eigen langzaam zakkende piek. Hoe
hard een vleugelpunt over het scherm veegt hangt af van de clip, de schaal van
het model en het aantal roerpunten, en een knop die daaraan hangt moet je bij
elk model opnieuw zoeken. Genormaliseerd staat `thrustForce` gewoon in
wereldeenheden.

### Twee dingen tegen de intuïtie in

Deze staan er niet voor niets zo in.

Roerpunten hangen aan vertices, niet aan botten, ook al lijkt dat laatste de
kortere weg. De botten van een glTF-model staan in hun eigen ruimte, en het
verschil met de plek waar het model verschijnt zit in de inverse bind matrices.
Bij deze draak liggen de botten tien eenheden boven de zichtbare mesh, achter de
camera langs. Waar iets echt uitkomt weet je pas na skinning, en dat geeft
`SkinnedMesh.getVertexPosition` plus `localToWorld`.

Passen gaat op een zelf opgemeten box, niet op `Box3.setFromObject`. Die laatste
leest voor een skinned mesh de gecachte bind-pose box, en die klopt hier niet:
het model werd er tien eenheden naast gezet en verdween achter de camera. De box
komt daarom uit dezelfde meting als de roerpunten, over de hele clip, zodat het
model tijdens de volledige vleugelslag in beeld blijft. Om dezelfde reden staat
frustum culling uit op de mesh: de cull-bol van een skinned mesh wordt uit de
bind pose berekend en daarna nog eens met de huidige matrixWorld
vermenigvuldigd, waardoor een geschaald en bewegend model wegvalt terwijl het pal
in beeld staat. Culling levert hier ook niets op, want het object is juist op het
beeld gepast.

## Randgevallen

Geen WebGL geeft een stille terugval naar de achtergrondkleur. Reduced motion
bevriest de simulatie en de animatie. Een model dat niet laadt valt terug op de
bol met een waarschuwing. Tab verborgen pauzeert, en de delta wordt afgekapt zodat de
simulatie bij terugkomst niet opspringt. Resize schaalt de buffers mee met een
dpr-plafond van 1,5.

## Testen

De rekenkundige kern is puur en heeft unit tests: het objectgedrag (doel
volgen, drift, de lijn met roerpunten), de projectie (scherm naar uv naar vlak),
de keuze van de roerpunten op een geanimeerd oppervlak, de asymmetrie van de
vleugelslag en de stuwkracht die eruit volgt. Eenenzestig tests, `npm test`. Het
beeld zelf wordt niet automatisch getest.

## Wat er bewust niet in zit

Geen audio, geen loader, geen paginatransities, geen postprocessing, geen
aparte mobiele profielen.
