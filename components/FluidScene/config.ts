import type { FluidSceneConfig } from './types'

/**
 * Alle knoppen op één plek.
 *
 * De waarden onder `simulation` komen uit de scene van Immersive Garden en
 * zijn bewust overgenomen: de oplosser is gevoelig, en deze combinatie geeft
 * het karakter dat we willen. De code eromheen is van ons, de afstelling is
 * van hen.
 *
 * Eenheden: de simulatie rekent in uv, dus 0 tot 1 over de vierkante buffer.
 * De scene rekent in eigen wereldeenheden waarin het object standaard 1 lang
 * is en de camera er recht bovenop staat.
 */
export const defaultConfig: FluidSceneConfig = {
  background: '#f4f4f4',
  clickImpulse: false,

  /* twee werkstanden om aan de belichting te kunnen zitten, zie types.ts */
  bareObject: false,
  diveEnabled: true,

  object: {
    color: '#6f7278',
    background: '#efefef',
    /* over de langste as, en dat is bij deze draak zijn spanwijdte. Het beeld is
       twee eenheden hoog, dus hier vult hij ruim driekwart van de hoogte. */
    length: 1.5,
    /* de rug naar de camera, en een halve slag zodat de kop naar boven wijst */
    flipped: false,
    spin: 180,
    height: 0,
    /* Deze drie gelden alleen nog voor de bol en voor stille modellen. Een
       geanimeerd model vliegt zelf, zie flight.ts, en trekt zich hier niets
       meer van aan. */
    followSpeed: 3.4,
    driftRadius: 0.34,
    driftSpeed: 0.22,

    stirPoints: 14,
    targetThrottle: 3000,

    /* De belichting, zie shading.ts. Doorgemeten tegen de vis van Immersive
       Garden: een matcap als grijze belichtingsramp, een lamp in de scene, en
       een optelling die er een bodem onder legt.

       matcapSweep en matcapGlossWidth samen bepalen of het hard of dromerig
       wordt, en ze staan nu allebei laag. Hoog is metaal: de overgang van donker
       naar licht wordt zo kort dat je hem als een rand over het lijf ziet lopen,
       en de glans wordt een puntje. Laag is de vis: één brede zachte gradiënt
       over zijn hele midden. Opgemeten uit hun matcap, over het rode kanaal dat
       hun shader leest — 197 in het hart, 45 op driekwart, 119 op de rand.

       matcapRimGap hoort bij matcapRim en niet los. Die 119 op de rand is de
       lijn om de vis heen, en de 45 daarvóór is waaróm je hem als lijn ziet.

       shadeFloor lager dan 0,25 en de draak zakt terug naar een silhouet zodra
       het onthullingsmasker eroverheen gaat. */
    matcapBase: 0.12,
    matcapSweep: 0.8,
    matcapGloss: 0.7,
    matcapGlossWidth: 3,
    matcapRim: 0.6,
    matcapRimGap: 0.35,

    /* De kleur van de ramp zelf. Hiervóór was die grijs, net als bij de vis, en
       grijs maal een textuur is schaduw en geen materiaal — hun vis haalt zijn
       kleur uit een koi-textuur en heeft dat dus niet nodig.

       Koele schaduw, warm licht: dat is het oudste trucje dat er is en het werkt
       omdat je ogen het als diepte lezen. De rand mag ergens anders zitten dan
       allebei; het is een dunne lijn, en juist daar valt een kleur op die verder
       nergens voorkomt.

       De verschuiving is met opzet klein. Op 0,12 zie je hem pas als hij draait
       — dan spoelt er een zweem over zijn vleugel — en dat is precies wat je
       wilt. Boven 0,4 wordt het een regenboog en gaat de draak eraan. */
    shadowTint: '#5c6f86',
    lightTint: '#f2ece2',
    rimTint: '#9fd4e8',
    iridescence: 0.12,
    iridescenceSpread: 1.6,
    lightAngle: 135,
    lightHeight: 0.55,
    lightPunch: 0.55,
    ambient: 0.8,
    shadeFloor: 0.35,

    /* Zijwaarts volgt hij de cursor, naar voren en achteren zweeft hij op ruis.
       De kop staat vast naar voren; alleen het lijf kantelt.

       followRate is een afruil en geen instelling die je maximaal wil hebben.
       Doorgemeten op een rustige veeg heen en weer over de volle breedte, met
       de kanteling zoals die nu staat:

         0,9   kantelt tot 34°, maar loopt 1,03 achter van zijn bereik 1,16
         1,5   tot 24°, achterstand 0,72   <- nu
         2,5   tot 16°, achterstand 0,46
         4,0   tot 10°, achterstand 0,30

       Dat sneller volgen mínder kanteling geeft is niet fout maar het gevolg
       van twee tijdschalen: de snelheidspiek wordt hoger maar veel korter, en
       het lijf heeft ook met bankRate 3,2 nog ruim drie tienden nodig om zijn
       stand te bereiken. Plak je de draak aan je cursor, dan krijg je vanzelf
       een stijf lijf.

       bankAngle is de bovengrens, niet wat je meestal ziet. */
    reachSide: 1.15,
    reachAhead: 1.1,
    /* Hoe hij zich tot je cursor verhoudt, zie pursuit.ts. Hij jaagt een oudere
       versie van je cursor na en mikt op een plek ernaast die langzaam om je
       heen draait — hij komt dus van links, dan van rechts, en er is nooit een
       moment waarop hij stilstaat omdat hij "er is".

       trailRate is achterlopen en niet dempen: op 1,3 loopt hij ruim een halve
       seconde achter, genoeg om bij een snelle zwenk de bocht af te snijden.
       orbitRate 0,11 is één rondgang per negen seconden. */
    trailRate: 1.3,
    releaseRate: 0.2,
    orbitRadius: 0.55,
    orbitRate: 0.11,
    /* Doorgemeten met een cursor die door het beeld zwenkt, tegenover hoe het
       was toen de cursor rechtstreeks zijn doel was:

         baan 0     hangt 0,17 van je cursor   100% dichtbij   0% uit beeld
         baan 0,55  hangt 0,53                  37% dichtbij   5% uit beeld  <- nu
         baan 0,95  hangt 0,81                  17% dichtbij  17% uit beeld

       Die middelste rij is met opzet: strakker volgen (trailRate 1,3) en een
       wijdere baan heffen elkaar deels op, dus hij hangt even dicht bij je als
       bij een kleinere baan maar wijkt vijf keer zo vaak echt uit. Dichtheid en
       uitstapjes zijn dus twee knoppen en niet één.

       glideBack moest mee omhoog. Naar beneden is zweven, en op 0,22 haalde hij
       de onderrand simpelweg niet, hoe wijd de baan ook stond. Boven 0,5
       verandert er niets meer, dus daar ligt de rem ergens anders. */

    followRate: 1.5,

    /* Vooruit en achteruit zijn met opzet niet gelijk. Vooruit kost slagen en
       gaat dus schoksgewijs; achteruit is zweven met gespreide vleugels en gaat
       traag en gelijkmatig. De hele kringloop doorgerekend — clipklok stuurt de
       slag, de slag levert de stuwkracht, de stuwkracht is de zet — over 0,85
       eenheid:

         vooruit    2,8 s, het slaan piekt op 1,00
         achteruit  3,6 s, het slaan komt niet van de grond: 0,00

       en na aankomst staat de clipklok op 0,000, precies in de zweefstand.

       beatRate moet sneller zijn dan de reis zelf, anders komen de vleugels bij
       een korte hop nooit op gang en schuift hij vooruit zonder te slaan. Op 2,5
       staan ze binnen een halve seconde aan het werk. */
    beatThrust: 1.1,
    glideBack: 0.5,
    arriveGap: 0.04,
    beatRate: 2.5,

    driftAhead: 0.05,
    driftRate: 0.09,
    bankAngle: 40,
    bankRate: 3.2,

    /* De rol om zijn eigen lengteas, bovenop die kanteling. De camera kijkt
       recht naar beneden, dus je ziet hem als een spanwijdte die korter wordt en
       één vleugel die naar je toe komt.

       Deze twee getallen horen bij elkaar: de hoek is een bovengrens en het
       tempo bepaalt hoeveel daarvan hij op een haal echt haalt. Doorgemeten op
       een besliste haal over de volle breedte, met wat er dan van de spanwijdte
       overblijft:

         20 / 3,6   haalt 15°, spanwijdte 97%, je moet het weten om het te zien
         30 / 3,6   haalt 23°, 92%
         45 / 5,5   haalt 38°, 78%
         60 / 5,5   haalt 51°, 63%   <- nu, een draak die op zijn kant de bocht in gaat
         75 / 5,5   haalt 64°, 44%, dan kijk je tegen zijn zij aan

       rollRate hoger dan bankRate, want in de lucht gaat het rollen voor op het
       draaien. Ze komen hier uit dezelfde gemeten snelheid, dus echt vooruitlopen
       kan niet, maar met een kortere tijdconstante zie je wel die volgorde.

       leanAngle is het enige dat niet uit zijn snelheid komt maar uit waar jij
       staat, en dat blijft dus staan als hij stilhangt. Dit draagt de rust: hangt
       hij ver rechts stil bij een cursor die nog verder rechts staat, dan is dit
       alles wat er nog van het volgen te zien is. */
    rollAngle: 60,
    rollRate: 5.5,
    leanAngle: 10,

    thrustResponse: 6,
    thrustAdapt: 0.3,
    glideHold: 0.9,
    /* Hoe snel hij ophoudt met slaan zodra je muis achter hem staat. Gemeten
       vanuit vol slaan tot de klok stilstaat:

         0,04   1,70 s      0,16   1,90 s
         0,08   1,80 s      0,30   2,75 s

       Onder de twee seconden zit vooral het uitlopen van `beatRate` plus de weg
       naar de eerstvolgende zweefstand, hooguit een kwart rondgang. Korter kan
       niet zonder hem midden in een slag te bevriezen. */
    soarBrake: 0.08,

    /* De procedurele laag op de clip.

       tailSway staat per schakel en stapelt over dertig schakels op. Op de echte
       botlengtes doorgerekend zwaait de punt daardoor veel verder dan het getal
       doet vermoeden:

         0,03    15% van de staartlengte, punt draait 16° t.o.v. de basis
         0,08    38%                                  42°
         0,12    54%                                  63°
         0,06    29%                                  32°   <- nu
         0,16    69%                                  85°
         0,22    85%                                 116°, de staart krult om

       Dit komt bovenop een clip die de staart al beweegt, dus dit is optellen
       en geen vervangen. Het tempo staat met opzet los van de vleugelslag van
       0,3 Hz: gaan die twee in de pas lopen, dan hoor je het patroon.

       neckFollow is in radialen. Het lijf hangt sinds `leanAngle` zelf al naar je
       toe, dus de kop hoeft het werk niet meer alleen te doen en mag kleiner:

         0,70   40°, de kop doet alles en draait mee als een schotel
         0,35   20°, genoeg om te zien wie hij aankijkt   <- nu
         0,18   10°, een blik en geen draai

       lookGive is tot hoe ver om hem heen jij die kop nog stuurt. Daarbuiten
       kijkt hij zijn eigen kant op, en dat moet ook: recht achter hem klapt de
       hoek naar een doel van +180° naar -180°, en een kop die dat volgt tolt in
       één frame rond. Op 2,0 (115°) is hij je al kwijt ruim voordat die omslag
       in zicht komt, en het weegt over in plaats van om te schakelen.

       gazeSweep is wat er dan overblijft. Kleiner dan neckFollow, want
       rondkijken is iets anders dan iets aankijken, en traag genoeg dat het
       leest als kijken en niet als zoeken. */
    tailSway: 0.06,
    tailRate: 1.4,
    tailWave: 3.2,
    neckFollow: 0.35,
    neckRate: 2.2,
    lookGive: 2,
    gazeSweep: 0.16,
    gazeRate: 0.13,

    /* De vleugels in de zweefstand. De clip staat daar stil en een stilstaande
       vleugel ziet er dood uit, dus hier komt een trage correctie overheen — met
       per kant een eigen trekking uit de ruis, want symmetrie is precies wat het
       levenloos maakt.

       Doorgerekend op de echte botlengtes van de vleugel beweegt de punt, en
       verschillen links en rechts, met dit deel van de spanwijdte:

         0,05   punt 15%   links-rechts 14%
         0,09   punt 26%   links-rechts 25%   <- nu
         0,15   punt 44%   links-rechts 42%
         0,25   punt 71%   links-rechts 68%, dan is het een slag geworden */
    soarLift: 0.09,
    soarRate: 0.35,

    /* De duik, en wat hem aanzet: dat jij er niet meer bent. Staat de cursor
       `idleAfter` seconden stil, of is hij het beeld uit, dan laat hij zich
       vallen en blijft hij weg tot je weer beweegt.

       Drie seconden is lang genoeg om niet af te gaan op een hand die even
       stilhangt, en kort genoeg om het verband te leggen tussen ophouden en zien
       vertrekken.

       diveEvery is de oude vaste ronde, in vleugelslagen, en staat uit. Boven
       nul duikt hij ook tussendoor: deze clip doet vier slagen per rondgang van
       3,3 seconde, dus tien slagen is grofweg acht seconden als hij doorwerkt.

       diveAcceleration is een versnelling: hij begint traag en valt steeds
       harder, zoals loslaten. Op 1,8 is hij in ongeveer een seconde onder de
       rand.

       awayTime is nu een ondergrens en geen wachttijd: zoveel blijft hij
       minstens weg, ook als je meteen weer beweegt, want anders is de leegte er
       niet geweest. */
    idleAfter: 3,

    diveEvery: 0,
    diveSpeed: 1.1,
    diveAcceleration: 3.2,
    diveDepth: 12,
    pitchTime: 1.6,
    fogDepth: 1.6,
    awayTime: 5,
    enterRate: 1.1,
    enterGap: 0.08,
  },

  simulation: {
    resolution: 1024,
    timeStep: 0.008,
    deceleration: 0.95,
    attenuation: 0.999,
    pressureIterations: 4,

    randomDirection: 0.5,
    firstNoiseScale: 1,
    secondNoiseScale: 2,
    velocityThreshold: 0.163,
    gapVelocityBoost: 3,
    gapAmount: { min: 0.435, max: 0.516 },

    /* mouseForce is 600. De cursor krijgt daar 0,1 van en de objectpunten 3,
       toegepast op de NDC-snelheid. Omgerekend naar onze uv-verplaatsing per
       frame levert dat deze twee getallen op. */
    cursorForce: 60,
    objectForce: 154,

    /* de kop staat naar boven, dus de wind gaat naar beneden. De terugslag mag
       vrijwel niets meer: duwt hij ook maar een beetje bovenwinds, dan loopt hij
       tegen het spoor van de vorige neerslag in en wordt de wind rommelig. Ruim
       de helft van de dwarsbeweging eruit gekamd, want dat is wat er naar opzij
       uitwaaiert; de rest blijft staan, anders wordt het een rechte muur. */
    windDirection: 270,
    strokeBias: 0.92,
    strokeSteering: 0.55,

    /* De lucht zakt zelf ook, zodat je erdoorheen zweeft in plaats van erin stil
       te hangen. De oplosser draait op een vaste stap per frame, dus reken je
       dit om naar seconden op het scherm met stap 0,008 bij 60 fps:

         0,08   een schermhoogte in 26 s, nauwelijks te betrappen
         0,12   in 17 s   <- nu
         0,25   in  8 s, je merkt dat het beweegt
         0,50   in  4 s, dan is het geen zweven meer maar vallen

       Per stap is dat een halve texel op een buffer van 1024, dus er wordt
       zachtjes geïnterpoleerd en niet gestapt. Ver boven de 0,5 gaat dat wel
       tellen: dan sleept elke stap het spoor een stukje uit. */
    windSpeed: 0.12,

    /* cursorSize 350, gedeeld door de schermruimtemaat 1,804 en genormaliseerd
       op een buffer van 1024 met basis 512, maal 0,5. De straal schaalt met de
       snelheid tussen 0,2 en 0,8 van deze waarde. */
    brushSize: 0.1894,
    brushSizeAtRest: 0.2,
    brushSizeAtSpeed: 0.8,
    brushSpeedRange: 0.08,
    screenSpaceSize: 1.804,

    intensityVariation: 0.06,
    shockwaveDuration: 0.7,

  },

  painting: {
    /* op nul: het model wordt onthuld door de stroming, maar niet meer door de
       stroming vervormd. Hoger zet je het beeld mee met het veld, en dan lijkt
       het alsof je door bewegend water naar het model kijkt. */
    warp: 0,
    rippleStrength: 0.025,
    tintAmount: 0.02,
    paletteBase: [0.5, 0.5, 0.5],
    paletteAmplitude: [0.5, 0.5, 0.5],
    paletteFrequency: [1, 1, 1],
    revealDuration: 0.5,

    /* Hoeveel van de draak er sowieso doorkomt, los van de stroming. Op 0 is het
       zoals het was: alleen zichtbaar waar je geveegd hebt. Zie types.ts. */
    presence: 0,

    /* En hoe die aanwezigheid opgebroken wordt. Zonder dit is hij overal even
       half doorzichtig — matglas, en dat leest als een instelling. Met gaten
       erin drijft er iets vóór hem langs. Zie types.ts.

       presenceDrift staat in schermhoogtes per seconde, en anders dan bij de
       slierten klopt dat ook: daar wordt de verschuiving ná het schalen opgeteld,
       dus daar drijft een grovere ruis vanzelf trager. Hier niet.

       Trager dan de slierten met opzet — dit zijn de banken en die zijn de
       vlokken. Lopen ze even snel, dan zie je één beweging in plaats van twee
       lagen. Maar niet té traag: grote banken hebben weinig rand om te volgen,
       dus die moeten juist iets harder lopen voordat je ze ziet bewegen. */
    presenceHoles: 0.7,
    presenceScale: 0.55,
    presenceDrift: 0.06,

    /* De luchtslierten. Ze leggen hun eigen kleur over het beeld in plaats van
       het object te onthullen, want onthullen werkt alleen waar het object
       staat en dat is precies niet waar je lucht wil zien.

       De kleur moet daarom genoeg van `background` verschillen. Doorgerekend in
       lineaire ruimte, want daar wordt in gemengd, en dan naar sRGB terug om te
       weten of je het ziet:

         #efefef, de doelachtergrond   4% verschil, op 0,3 nog geen 1/255, weg
         #e6e6e8                      11% verschil, op 0,3 zo'n 4/255
         #d8d8dc                      21% verschil, op 0,3 zo'n 7/255, duidelijk

       En met de kleur van nu, wat `wispAmount` op zijn dichtst oplevert:

         0,30   4/255, duidelijk aanwezig
         0,15   2/255, je merkt het maar het dringt zich niet op   <- nu
         0,08   1/255, op de grens van wat een scherm nog toont

       Het meeslepen en het wegblazen hieronder schalen hiermee mee, want die
       werken op de mist die er is. Zachter zetten doe je dus hier, in één getal.

       wispSpeed staat in schermhoogtes per seconde en loopt op de framedelta,
       niet op de vaste stap van de oplosser: 0,1 is een schermhoogte in tien
       seconden. */
    wispAmount: 0.15,
    wispColor: '#e6e6e8',
    wispScale: 1.2,
    wispGap: 0.55,
    wispSpeed: 0.1,

    /* Hoe de mist op de stroming reageert. Zonder deze twee scrollt hij alleen
       maar langs en trekt hij zich van de cursor en de draak niets aan.

       wispWarp sleept mee. Ruim boven `warp` mag: dat getal boog het beeld van
       de draak zelf krom en dat oogde als water, dit verschuift alleen de mist.
       wispClear veegt schoon. Op 1 is een volle veeg precies genoeg; iets
       eronder blijft er een waas staan in het spoor, wat natuurlijker leest dan
       een harde snede. */
    wispWarp: 0.25,
    wispClear: 0.9,
  },
}
