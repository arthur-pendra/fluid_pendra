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

    /* Zijwaarts volgt hij de cursor, naar voren en achteren zweeft hij op ruis.
       De kop staat vast naar voren; alleen het lijf kantelt.

       followRate is een afruil en geen instelling die je maximaal wil hebben.
       Doorgemeten op een rustige haal heen en weer over de volle breedte:

         0,9   kantelt tot 21°, maar loopt 1,10 achter van zijn bereik 1,16
         1,5   tot 16°, achterstand 0,78   <- nu
         2,5   tot 11°, achterstand 0,51
         4,0   tot  7°, achterstand 0,33

       Dat sneller volgen mínder kanteling geeft is niet fout maar het gevolg
       van twee tijdschalen: de snelheidspiek wordt hoger maar veel korter, en
       het lijf heeft met bankRate 2,4 ruim vier tienden nodig om zijn stand te
       bereiken. Plak je de draak aan je cursor, dan krijg je vanzelf een stijf
       lijf.

       bankAngle is de bovengrens, niet wat je meestal ziet. */
    reachSide: 0.65,
    reachAhead: 0.6,
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
    glideBack: 0.22,
    arriveGap: 0.04,
    beatRate: 2.5,

    driftAhead: 0.05,
    driftRate: 0.09,
    bankAngle: 25,
    bankRate: 2.4,

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

       neckFollow is in radialen: 0,45 is een kwartslag, 1,3 is ruim 75 graden en
       daarmee niet te missen welke kant hij op kijkt. */
    tailSway: 0.06,
    tailRate: 1.4,
    tailWave: 3.2,
    neckFollow: 0.7,
    neckRate: 2.2,

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

    /* De duik. Om de zoveel vleugelslagen laat hij zich vallen en komt hij van
       opzij weer binnen.

       In slagen aftellen en niet in seconden, want dat is het verschil tussen
       een draak die af en toe duikt en een metronoom: hij slaat harder als hij
       vooruit moet, dus in drukke stukken komt de duik eerder. Deze clip doet
       vier slagen per rondgang van 3,3 seconde, dus tien slagen is grofweg acht
       seconden als hij doorwerkt, en langer als hij veel zweeft.

       Om te testen op 10; later hoger. Op 0 duikt hij nooit.

       diveAcceleration is een versnelling: hij begint traag en valt steeds
       harder, zoals loslaten. Op 1,8 is hij in ongeveer een seconde onder de
       rand. */
    /* wegzakken bij een stilstaande muis. De fog is op 1,6 eenheden compleet,
       dus op 3 is hij ruim weg en heeft hij nog wat marge. */
    idleAfter: 3,
    idleDepth: 3,
    idleRate: 0.7,

    diveEvery: 10,
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
