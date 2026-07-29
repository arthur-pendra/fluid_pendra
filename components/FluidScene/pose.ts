import { noise } from './flight'
import type { PoseConfig, Vec2 } from './types'

/**
 * Het rekenwerk van de procedurele laag bovenop de clip: hoeveel elke schakel
 * van een keten draait. Pure functies over getallen, zodat het gedrag te testen
 * is zonder three.js en zonder een draaiend model.
 *
 * Twee ketens, twee verschillende soorten leven:
 *
 *   De staart doet iets uit zichzelf. Een lopende golf van basis naar punt, die
 *   naar de punt toe uitslaat. Dat is dezelfde vorm als de vis: de fase schuift
 *   op langs het lijf zodat de golf reist in plaats van dat het geheel heen en
 *   weer wipt, en de amplitude groeit naar het uiteinde zodat de basis rustig
 *   blijft.
 *
 *   De nek reageert op jou. De kop draait naar de cursor, verdeeld over elf
 *   schakels zodat het een bocht wordt en geen knik. Maar alleen zolang je vóór
 *   hem staat: ga je erachter, dan laat hij je los en kijkt hij zijn eigen kant
 *   op. Dat is niet alleen gedrag, het houdt hem ook heel — zie `lookHold`.
 *
 *   De vleugels doen iets in de zweefstand. Daar staat de clip stil, en een
 *   stilstaande vleugel ziet er dood uit; een zwevende vogel corrigeert continu
 *   op wat de lucht doet. Dat is hier een trage ruis op de vleugelhoek, met per
 *   kant een eigen trekking zodat links en rechts nooit gelijk lopen. Symmetrie
 *   is precies wat het levenloos maakt.
 */

/**
 * Hoe scheef de uitslag naar de punt van de staart trekt.
 *
 * Boven de 1, dus de eerste schakels blijven vrijwel stil. Op 1 zwaait de basis
 * evenredig mee en dan lijkt het of de staart aan de romp trekt in plaats van
 * eraan hangt.
 */
const TAIL_FALLOFF = 1.6

/**
 * Hoe diep de langzame ademhaling over de amplitude gaat, en hoe traag.
 *
 * Zonder dit is de staart een metronoom, en dat is precies wat een vaste clip
 * ook al is. De trage slag is met opzet geen deler van de golf zelf, anders
 * lopen ze samen en hoor je het patroon alsnog.
 */
const TAIL_BREATH_DEPTH = 0.35
const TAIL_BREATH_RATE = 0.19

/**
 * De uitslag van één staartschakel, in radialen.
 *
 * `t` loopt van 0 aan de basis tot 1 in de punt.
 */
export const tailAngle = (t: number, time: number, config: PoseConfig): number => {
  /* de fase loopt achter naarmate je verder naar de punt komt, dus de golf
     reist naar achteren in plaats van dat alles tegelijk uitslaat */
  const travel = time * config.tailRate - t * config.tailWave
  const breath = 1 - TAIL_BREATH_DEPTH + TAIL_BREATH_DEPTH * Math.sin(time * TAIL_BREATH_RATE)

  return Math.sin(travel) * config.tailSway * breath * Math.pow(t, TAIL_FALLOFF)
}

/**
 * Hoe de totale nekdraai over de schakels verdeeld wordt: een deel per schakel,
 * samen precies 1.
 *
 * Naar de kop toe zwaarder, want een nek buigt onderin nauwelijks. Wordt één
 * keer per model uitgerekend, niet per frame.
 */
const NECK_BIAS = 1.8

export const neckWeights = (count: number): number[] => {
  if (count <= 0) return []

  const raw = Array.from({ length: count }, (_, index) => Math.pow((index + 1) / count, NECK_BIAS))
  const total = raw.reduce((sum, value) => sum + value, 0)

  return raw.map((value) => value / total)
}

/**
 * De hoek van `heading` naar `target`, ongeknipt, van -180° tot 180°.
 *
 * Alles in de coördinaten van het vlak waar het object op zweeft, waar `y` de
 * z-as van de scene is. De uitkomst is een draai om de wereld-op, en die telt
 * tegen de klok in op het scherm — vandaar het minteken op het kruisproduct,
 * want de z-as loopt op het scherm andersom.
 */
export const bearing = (heading: Vec2, target: Vec2): number => {
  const length = Math.sqrt(target.x * target.x + target.y * target.y)
  if (length < 1e-6) return 0

  const x = target.x / length
  const y = target.y / length

  const cross = heading.x * y - heading.y * x
  const dot = heading.x * x + heading.y * y

  return Math.atan2(-cross, dot)
}

/**
 * De hoek waarover de kop moet draaien om van `heading` naar `target` te kijken,
 * geknipt op `limit`.
 */
export const lookYaw = (heading: Vec2, target: Vec2, limit: number): number =>
  Math.max(-limit, Math.min(limit, bearing(heading, target)))

/**
 * Waar de kop nog vrij mag draaien voordat hij begint los te laten, als deel
 * van `give`.
 *
 * Niet op de grens zelf loslaten maar er een stuk voor beginnen, want anders is
 * de overgang een knik: hij volgt tot het laatst en houdt dan ineens op.
 */
const LOOK_FADE = 0.5

/**
 * Hoeveel de cursor de kop nog stuurt, 1 tot 0, naar hoe ver hij om hem heen
 * staat.
 *
 * Dit is de reparatie van een echte fout en niet alleen een verfraaiing. De hoek
 * naar een doel recht achter hem klapt van +180° naar -180° zodra je er een haar
 * langs gaat, en een kop die dat volgt zwiept in één frame de hele ronde om. Dat
 * is het rondtollen dat je ziet als je achter hem gaat staan.
 *
 * Met dit gewicht komt hij daar niet eens: ruim voor die omslag is de cursor de
 * kop al kwijt en kijkt hij zijn eigen kant op. Geëgaliseerd, zodat het overgaat
 * in plaats van omschakelt, en op nul aan de achterkant zodat de sprong die daar
 * in de hoek zit met nul vermenigvuldigd wordt.
 */
export const lookHold = (heading: Vec2, target: Vec2, give: number): number => {
  if (give <= 1e-6) return 0

  const away = Math.abs(bearing(heading, target))
  const held = give * LOOK_FADE
  if (away <= held) return 1

  const gone = Math.min(1, (away - held) / (give - held))
  return 1 - gone * gone * (3 - 2 * gone)
}

/**
 * Waar hij uit zichzelf naar kijkt, in radialen.
 *
 * Wat er overblijft als jij er niet bent of achter hem staat. Waarde-ruis en
 * geen sinus, om dezelfde reden als overal in dit bestand: een periode zie je
 * na een minuut kijken terug.
 */
export const gazeYaw = (time: number, config: PoseConfig): number =>
  (noise(time * config.gazeRate + 3.9) * 2 - 1) * config.gazeSweep

/**
 * Naar een hoek toe dempen, met een tempo dat aan de tijd hangt en niet aan de
 * framerate. Een kop die in één frame op zijn doel staat kijkt niet, die klikt.
 */
export const approach = (current: number, target: number, rate: number, delta: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * delta))

/**
 * Hoe scheef de zweefbeweging naar de vleugelpunt trekt.
 *
 * Onder 1, dus de schouder doet het meeste en de punt volgt. Een vleugel draagt
 * bij de schouder en buigt naar buiten toe mee; andersom ziet het eruit alsof
 * alleen het puntje trilt.
 */
const SOAR_TAPER = 0.55

/**
 * Hoeveel sneller de kleine correctie aan de punt loopt dan de trage hoofdslag,
 * en hoe groot die is ten opzichte daarvan.
 *
 * Geen geheel getal, want dan lopen de twee in de pas en zie je het patroon.
 */
const SOAR_RIPPLE_RATE = 2.7
const SOAR_RIPPLE = 0.3

/**
 * De hoek van één vleugelbot tijdens het zweven, in radialen.
 *
 * `t` loopt van 0 aan de schouder tot 1 aan de hand, `seed` zet de twee vleugels
 * op een eigen plek in de ruis.
 */
export const soarAngle = (t: number, time: number, seed: number, config: PoseConfig): number => {
  const slow = noise(time * config.soarRate + seed) * 2 - 1
  const ripple = noise(time * config.soarRate * SOAR_RIPPLE_RATE + seed + 7.3) * 2 - 1

  return (slow + ripple * SOAR_RIPPLE * t) * config.soarLift * (1 - SOAR_TAPER * t)
}
