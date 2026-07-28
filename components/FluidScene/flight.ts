import type { FlightConfig, Vec2 } from './types'

/**
 * Zweven op de vleugels, met de kop vooruit.
 *
 * Twee eerdere opzetten zijn hierop stukgelopen en die zijn het noemen waard,
 * want ze zijn allebei aantrekkelijk.
 *
 * De eerste was een doelvolger met een lissajous eroverheen. Die schoof
 * zijwaarts door het beeld: het lijf wees de ene kant op en de beweging ging de
 * andere kant op, en dat leest als een sprite die verschoven wordt.
 *
 * De tweede draaide dat om — altijd vooruit langs de eigen neus, en de koers
 * draaide vrij rond. Dat vliegt wel, maar dan vliegt hij ook wég: hij keert om,
 * gaat ondersteboven het beeld door, en de camera hangt niet meer boven een
 * draak maar boven een baan.
 *
 * Wat het wél moet zijn zit ertussenin. De kop staat vast naar voren, en zijn
 * plek zweeft daar subtiel omheen: zijwaarts het meest, want dat is wat een
 * vleugel doet als hij een luchtstroom pakt, en naar voren en achteren wat
 * minder. Het lijf kantelt daar een graad of tien in mee, en dát is wat het
 * zweven van glijden onderscheidt: een vleugel die naar rechts draagt heeft zijn
 * neus ook een beetje naar rechts. En op de vleugelslag komt hij naar voren.
 *
 * De plek komt uit ruis en niet uit sinussen. Een lissajous heeft een periode,
 * en over een minuut kijken zie je die terugkomen — precies het patroon dat we
 * met een procedurele laag juist proberen weg te halen.
 *
 * Pure functies over getallen, zodat het gedrag te testen is zonder three.js.
 */
export type FlightState = {
  /** waar hij hangt, op het vlak waar het object zweeft; `y` is de z-as */
  position: Vec2
  /** hoeveel het lijf meekantelt met het zweven, in graden om de vaste koers */
  bank: number
  /** verstreken tijd, voedt de ruis */
  elapsed: number
}

/**
 * De vaste koers: recht naar boven op het scherm. Door `spin` staat het model
 * daar al op, dus wat `bank` erbij doet is meteen de draai die het krijgt.
 */
export const BASE_HEADING = 90

/**
 * Gladde ruis van 0 tot 1, zonder toestand en zonder tabel.
 *
 * Waarde-ruis en geen som van sinussen: die laatste heeft een periode, en over
 * een minuut kijken zie je die terugkomen.
 */
export const noise = (x: number): number => {
  const whole = Math.floor(x)
  const fraction = x - whole

  const hash = (n: number) => {
    const value = Math.sin(n * 127.1) * 43758.5453
    return value - Math.floor(value)
  }

  /* smoothstep tussen twee trekkingen, zodat de afgeleide niet springt */
  const blend = fraction * fraction * (3 - 2 * fraction)
  return hash(whole) * (1 - blend) + hash(whole + 1) * blend
}

/**
 * De steilste helling die `noise` kan hebben, als deel van zijn bereik per
 * eenheid x. De smoothstep haalt zijn maximum halverwege een cel, op 1,5.
 *
 * Hiermee staat `bankAngle` gewoon in graden. Zonder zou het aan de driftstraal
 * en het driftempo hangen, en dan moet je hem bij elke wijziging opnieuw zoeken.
 */
const NOISE_SLOPE = 1.5

/** ruis van -1 tot 1, met een eigen plek in het veld zodat de assen verschillen */
const swing = (elapsed: number, rate: number, offset: number) =>
  noise(elapsed * rate + offset) * 2 - 1

/**
 * Waar hij op een moment hangt. De plek is een zuivere functie van de tijd, dus
 * de begintoestand kan hem gewoon uitrekenen in plaats van op nul te beginnen.
 *
 * Dat scheelt een sprong. Startte hij op de oorsprong, dan stond hij één frame
 * later ineens waar de ruis hem wilde hebben — tot een derde beeldhoogte in één
 * klap — en die schijnsnelheid sloeg de kanteling meteen op zijn eindstand.
 */
const placeAt = (elapsed: number, config: FlightConfig, boost: number): Vec2 => ({
  x: swing(elapsed, config.driftRate, 0) * config.driftSide,
  /* naar voren is op het scherm omhoog, en `y` is de z-as die daar andersom
     loopt, dus de zet van de slag gaat er met een minteken af */
  y: swing(elapsed, config.driftRate * 0.63, 41.7) * config.driftAhead - boost * config.beatSurge,
})

export const createFlightState = (config: FlightConfig): FlightState => ({
  position: placeAt(0, config, 0),
  bank: 0,
  elapsed: 0,
})

/** een hoek in graden terug naar het bereik -180 tot 180 */
export const wrapAngle = (degrees: number): number => {
  const wrapped = (((degrees + 180) % 360) + 360) % 360
  return wrapped - 180
}

/**
 * Eén stap. `boost` is de zet van de vleugelslag, 0 tot 1: op de slag komt hij
 * naar voren, ertussenin zakt hij weer terug.
 */
export const stepFlight = (
  state: FlightState,
  config: FlightConfig,
  boost: number,
  delta: number,
): FlightState => {
  const elapsed = state.elapsed + delta

  /* zijwaarts het meest, dat is het zweven zelf. De twee assen lezen de ruis op
     een eigen plek en op een eigen tempo, anders lopen ze samen en zwabbert hij
     over één diagonaal heen en weer. */
  const position = placeAt(elapsed, config, boost)

  /* Het lijf kantelt mee met hoe hard hij zijwaarts zweeft. Afgezet tegen de
     steilste helling die de ruis kan hebben, zodat `bankAngle` in graden staat
     en niet meebeweegt met de driftstraal. Naar rechts zwevend hoort de neus
     ook naar rechts, en rechtsom is op het scherm de negatieve kant op. */
  const fastest = config.driftSide * 2 * config.driftRate * NOISE_SLOPE
  const sideways = fastest > 1e-9 ? (position.x - state.position.x) / delta / fastest : 0
  const target = Math.max(-1, Math.min(1, sideways)) * -config.bankAngle

  /* er met vertraging naartoe: een lijf dat meteen op zijn eindstand staat
     kantelt niet, dat klapt */
  const bank = state.bank + (target - state.bank) * (1 - Math.exp(-config.bankRate * delta))

  return { position, bank, elapsed }
}
