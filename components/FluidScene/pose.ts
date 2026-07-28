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
 *   schakels zodat het een bocht wordt en geen knik.
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
 * De hoek waarover de kop moet draaien om van `heading` naar `target` te kijken,
 * geknipt op `limit`.
 *
 * Alles in de coördinaten van het vlak waar het object op zweeft, waar `y` de
 * z-as van de scene is. De uitkomst is een draai om de wereld-op, en die telt
 * tegen de klok in op het scherm — vandaar het minteken op het kruisproduct,
 * want de z-as loopt op het scherm andersom.
 */
export const lookYaw = (heading: Vec2, target: Vec2, limit: number): number => {
  const length = Math.sqrt(target.x * target.x + target.y * target.y)
  if (length < 1e-6) return 0

  const x = target.x / length
  const y = target.y / length

  const cross = heading.x * y - heading.y * x
  const dot = heading.x * x + heading.y * y
  const yaw = Math.atan2(-cross, dot)

  return Math.max(-limit, Math.min(limit, yaw))
}

/**
 * Naar een hoek toe dempen, met een tempo dat aan de tijd hangt en niet aan de
 * framerate. Een kop die in één frame op zijn doel staat kijkt niet, die klikt.
 */
export const approach = (current: number, target: number, rate: number, delta: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * delta))
