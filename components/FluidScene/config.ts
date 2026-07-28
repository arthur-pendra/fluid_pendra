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
    followSpeed: 3.4,
    driftRadius: 0.34,
    driftSpeed: 0.22,
    /* een geanimeerd model roert met deze punten over zijn eigen oppervlak,
       dus hier bepaal je hoeveel ervan tegelijk zichtbaar wordt. Voor de bol en
       voor stille modellen is het het aantal punten over de lengte. */
    stirPoints: 14,
    targetThrottle: 3000,
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
    warp: 0.005,
    rippleStrength: 0.025,
    tintAmount: 0.02,
    paletteBase: [0.5, 0.5, 0.5],
    paletteAmplitude: [0.5, 0.5, 0.5],
    paletteFrequency: [1, 1, 1],
    revealDuration: 0.5,
  },
}
