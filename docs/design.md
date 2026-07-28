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

### Zweven, kantelen, en een zet per slag

De draak stond stil op de oorsprong. Nu zweeft hij, en dat is via twee doodlopende
wegen gegaan die allebei aantrekkelijk zijn.

De eerste was een doelvolger met een lissajous eroverheen — de opzet die voor de
bol prima werkte. Die schuift zijwaarts door het beeld: het lijf wijst de ene
kant op en de beweging gaat de andere kant op, en dat leest als een sprite die
verschoven wordt. Bij een klik verzet het doel zich bovendien ineens.

De tweede draaide dat om: altijd vooruit langs de eigen neus, met een begrensde
draaisnelheid, zoals de vis van Immersive Garden. Dat vliegt, maar dan vliegt hij
ook wég — hij keert om, gaat ondersteboven het beeld door, en de camera hangt
niet meer boven een draak maar boven een baan.

Wat het wel is zit ertussenin, en de twee assen doen los van elkaar iets anders.
De kop staat vast naar voren; alleen het lijf draait.

Zijwaarts volgt hij de cursor, en staat die niet in beeld dan is het midden het
doel. Niet er meteen op staan maar er met gewicht naartoe, want dat achterlopen
is wat de kanteling voedt. Zijn bereik is een deel van de halve beeldbreedte en
geen wereldmaat: vast ingesteld gebruikt hij op een breed scherm maar een derde
van de breedte en op een smal scherm te veel.

Naar voren en achteren zweeft hij op waarde-ruis, en de vleugelslag zet hem daar
bovenop naar voren. De cursor doet aan die as voorlopig niets. De ruis is geen
som van sinussen: een lissajous heeft een periode en die zie je binnen een minuut
terugkomen, precies het patroon dat een procedurele laag moet weghalen. Hij is
ook een zuivere functie van de tijd, dus de begintoestand rekent hem uit in
plaats van op nul te beginnen — anders stond hij één frame na het laden ineens
waar de ruis hem wilde hebben.

Het lijf kantelt tot vijfentwintig graden mee met hoe hard hij zijwaarts gaat, en
dát is wat zweven van schuiven onderscheidt: een vleugel die naar rechts draagt
heeft zijn neus ook naar rechts. Zonder die kanteling wijst het lijf de ene kant
op terwijl de beweging de andere kant op gaat, en dan leest het als een sprite.
De hoek wordt genormaliseerd op de snelheid van een besliste haal, zodat
`bankAngle` in graden staat en niet meebeweegt met het volgtempo. De windas
kantelt mee, dus het spoor blijft achter hém liggen.

Het volgtempo is een afruil en geen instelling die je maximaal wil hebben. Op een
rustige haal over de volle breedte kantelt hij bij 0,9 tot 21 graden maar loopt
hij 1,10 achter van zijn bereik 1,16; bij 4,0 is de achterstand nog 0,33 maar
kantelt hij nog maar 7 graden. Dat sneller volgen mínder kanteling geeft is niet
fout maar het gevolg van twee tijdschalen: de snelheidspiek wordt hoger maar veel
korter, en het lijf heeft ruim vier tienden nodig om zijn stand te bereiken. Wie
de draak aan zijn cursor plakt krijgt vanzelf een stijf lijf.

### Een zet per slag, en langer open vleugels

Op de vleugelslag komt hij naar voren. Meten hoeft daar niet apart voor: voor de
wind wordt per roerpunt al uitgerekend hoeveel van zijn beweging benedenwinds
gaat, en dat signaal piekt tijdens de neerslag en valt weg tijdens de terugslag.
Dezelfde derde wet die de wind verklaart, andersom gelezen.

Bij de vis loopt dit precies omgekeerd, en dat is het noemen waard omdat het de
voor de hand liggende route is. Daar stuurt een boid de snelheid aan en volgt de
staartslag daaruit — `oscillationPower` is niets anders dan de snelheid maal een
factor. Dat kan omdat die vis procedureel buigt over drie gewrichten. Onze draak
brengt een gebakken clip mee, dus daar valt niets uit te sturen: de slag ligt vast
en de stuwkracht moet er juist uit afgeleid worden.

De eerste opzet was de natuurkundige: kracht bij een snelheid optellen, weerstand
eraf, een veer die terugtrekt. Doorgerekend op een slag van anderhalve hertz gaf
dat 0,3% beeldhoogte aan wiebel op een uitslag van 4% — hij ging een stukje
vooruit staan en bleef daar hangen. Dat is geen kwestie van afstellen: massa met
een veer is een laagdoorlaat van de tweede orde, en die dempt alles boven zijn
eigen frequentie met het kwadraat van de verhouding. Zichtbaar krijgen zou
betekenen de veer op de slagfrequentie afstemmen, en die staat in de clip en
nergens in de code. Het signaal volgt de slag daarom rechtstreeks, met
vertraging; dat is frequentie-onafhankelijk en de vertraging is wat het als duwen
laat lezen in plaats van als pulseren.

De gemeten slagkracht wordt afgezet tegen zijn eigen langzaam zakkende piek. Hoe
hard een vleugelpunt over het scherm veegt hangt af van de clip, de schaal van het
model en het aantal roerpunten, en een knop die daaraan hangt moet je bij elk
model opnieuw zoeken.

### Slaan om vooruit te komen, zweven om terug te zakken

De twee richtingen op de voor-achteras zijn met opzet niet gelijk, en dat is waar
het realisme vandaan komt. Vooruit kost slagen: de afgelegde weg is de gemeten
slagkracht maal `beatThrust`, dus tussen twee slagen door schuift hij niet op en
zie je de zetjes. Achteruit kost niets, want een vogel klapwiekt niet om
achteruit te zakken — die spreidt zijn vleugels en laat zich dragen. Dat gaat dus
op een eigen, trage snelheid.

Daarmee loopt de clip niet meer los van de vlucht. `beating` zegt of hij de
vleugels nodig heeft, en dat stuurt de klok van de animatie. Het valt rond: geen
slagen betekent geen gemeten slagkracht, dus geen stuwkracht, dus blijft de vraag
om vooruit te komen staan tot de vleugels op gang zijn.

De eerste opzet vertraagde daarvoor de hele clip, en dat zag er verkeerd uit: een
draak die in slow motion doorklapwiekt is niet hetzelfde als een die ophoudt met
slaan. De slag houdt nu zijn eigen tempo. Wat er wél gebeurt is dat hij de slag
waar hij in zit gewoon afmaakt en daarna tot stilstand komt op de plek in de clip
waar de vleugels het verst gespreid staan. Die plek is te vinden zonder hem aan
te wijzen: het is het bemonsteringspunt waar het oppervlak het minst beweegt, en
dat was al opgemeten. Voorbijschieten kan niet, want de snelheid loopt met het
kwadraat van wat er nog te gaan is naar nul.

In de zweefstand staat de clip stil, en een stilstaande vleugel ziet er dood uit
— een zwevende vogel corrigeert continu op wat de lucht doet. Daar komt daarom
een trage ruis op de vleugelhoek overheen, geschaald op hoe wéinig hij slaat,
zodat het tijdens het slaan niet tegen de clip in gaat. Per kant een eigen
trekking, want symmetrie is precies wat het levenloos maakt: doorgerekend op de
echte botlengtes beweegt de vleugelpunt 26% van de spanwijdte en verschillen
links en rechts tot 25%.

De as waar een vleugel omheen stijgt en daalt is opgemeten en niet ingetypt, om
dezelfde reden als bij de ketens: die kiest de rigger. Het is de lijfas, van de
staartwortel naar de nekwortel, en bij deze draak ligt de lokale z van elk
vleugelbot daar netjes mee op één lijn.

De hele kringloop doorgerekend over 0,85 eenheid: vooruit 2,8 seconden met het
slaan op 1,00, achteruit 3,6 seconden met het slaan op 0,00, en na aankomst staat
de klok op nul, precies in de zweefstand.

De vleugels blijven ook langer gespreid. De draak zweeft al meer dan hij slaat —
vier slagen in dertien seconden, zo'n 0,3 Hz — maar de clip loopt op één tempo af,
dus het zweven en het slaan krijgen evenveel tijd. Dat is te veranderen zonder één
bot aan te raken, door de klok van de clip ongelijkmatig te laten lopen: traag waar
de vleugels traag bewegen, snel waar ze snel gaan. Geen nieuwe beweging dus maar
een uitvergroting van wat de rigger er al in zette, en daarom blijft het eruitzien
als zijn animatie. De rondgang duurt even lang, want de tijdschaal wordt zo
genormaliseerd dat de som van 1/schaal gelijk blijft; anders zou de knop ook het
tempo verzetten. Twee dingen komen daar gratis uit: de vleugel gaat op de slag
harder door de lucht, dus de gemeten slagkracht piekt hoger en de zet komt
sterker precies op het moment dat hij hoort te komen.

### Een eigen laag bovenop de clip

De draak brengt een rig van 221 botten mee waarvan er 216 in de clip zitten:
`tail_01..30`, `neck_01..11`, `spine_01..08`, vleugelvliezen die aan de vingers
hangen, plus kaak, tong, oogleden en stekels. Die vliegcyclus met de hand
naschrijven levert iets slechters op dan er nu staat. De ketens ernaast zijn wel
precies waar code sterker is dan een vaste clip, want daar wil je variatie en
reactie op de scene. Dus: bovenop, niet in plaats van.

Dat kan omdat de mixer elke frame de hele botstand opnieuw schrijft. Een draai
die je daarna op een bot vermenigvuldigt stapelt niet op maar geldt precies één
frame. Voorwaarde is alleen dat het ná de mixer en vóór `updateMatrixWorld`
gebeurt, en dat haakje lag er al voor de roerpunten.

Om welke as staat nergens in een glb — een rigger kiest die zelf. De as staat
daarom in wereldruimte: omhoog voor de ketens, want een draai daaromheen leest
van bovenaf als zwaaien, en de lijfas voor de vleugels.

Die as moet per frame naar de eigen ruimte van elk bot worden omgerekend, en dat
was eerst niet zo. Een draai die je op `bone.quaternion` vermenigvuldigt geldt in
het frame waar de clip het bot op dát moment heeft staan, niet zoals het in de
bindstand stond, dus zodra de ouders meedraaien wijst een as uit de bindstand
ergens anders heen. Opgemeten over de clip staat zo'n as tot 66 graden scheef op
de staart, 78 op de nek en 45 op de vleugels — en bij die hoeken is een zwaai
voor een groot deel een draai om de staart-as zelf geworden. Per frame omgerekend
is de afwijking nul en verzet de laag de staartpunt volledig zijwaarts in plaats
van voor negentig procent. Het kost een extra `updateMatrixWorld` per frame:
12,6 µs, oftewel 0,08% van een frame op 60 fps.

`scripts/inspect-rig.mjs` rekent de bindstand offline uit om een nieuw model
langs te leggen.

De staart doet iets uit zichzelf: een lopende golf van basis naar punt, met een
trage ademhaling over de amplitude zodat het geen metronoom wordt. De nek
reageert: de kop draait naar de cursor, verdeeld over elf schakels zodat het een
bocht wordt en geen knik. De stekels blijven er expliciet buiten — die hangen al
aan de keten en waaieren uit als je ze ook nog los draait. Dat is de enige
manier waarop dit stil kan misgaan, dus het staat in een test tegen de echte 221
botnamen.

Twee getallen om te kennen. `tailSway` staat per schakel en stapelt over dertig
schakels op, dus het zwaait veel verder dan het getal doet vermoeden: op de echte
botlengtes doorgerekend brengt 0,02 de punt 10% van de staartlengte opzij en 0,08
al 38%. En de kosten: veertig quaternionen per frame is 2,2 µs, oftewel 0,013%
van een frame op 60 fps. De mixer interpoleert er al 412 kanalen naast.

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
vleugelslag, de stuwkracht die eruit volgt, het zweven met zijn kanteling, de
ongelijkmatige clipklok en de procedurele laag op de botten — die laatste met het
echte skelet als fixture, want daar is misgaan stil. Honderdnegentien tests,
`npm test`. Het beeld zelf wordt niet automatisch getest.

## Wat er bewust niet in zit

Geen audio, geen loader, geen paginatransities, geen postprocessing, geen
aparte mobiele profielen.
