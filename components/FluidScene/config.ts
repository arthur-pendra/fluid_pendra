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

  object: {
    color: '#6f7278',
    background: '#efefef',
    length: 1.25,
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

    /* Zweven op de vleugels, met de kop vast naar voren.

       Zijwaarts het meest, want dat is het zweven zelf; naar voren en achteren
       de helft daarvan, anders wordt het dobberen. Doorgerekend over een kwartier
       zweeft hij 28% van de beeldhoogte naar opzij en 17% naar voren en achteren,
       oftewel een halve draaklengte breed.

       Het driftempo bepaalt hoe vaak hij overhaalt:

         0,05   elke 41 s van links naar rechts, te traag om nog te lezen
         0,09   elke 21 s   <- nu
         0,14   elke 14 s
         0,20   elke 10 s, dan wordt het onrustig

       bankAngle is wat zweven van glijden onderscheidt. Twaalf graden is genoeg
       om te zien dat het lijf meegaat en te weinig om te lijken alsof hij
       stuurt. */
    driftSide: 0.3,
    driftAhead: 0.14,
    driftRate: 0.09,
    beatSurge: 0.12,
    bankAngle: 12,
    bankRate: 1.6,

    thrustResponse: 6,
    thrustAdapt: 0.3,
    glideHold: 0.9,

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
  },
}
