import { noise } from './flight'
import type { PursuitConfig, Vec2 } from './types'

/**
 * Waar de draak op mikt, gegeven waar jouw cursor staat.
 *
 * Dit stond er eerst niet: de cursor ging rechtstreeks als doel de vlucht in, en
 * dan blijft er van "volgen" niets over dan een draak die op je muis geplakt
 * zit. Hij komt er wel met gewicht naartoe — `followRate` dempt de beweging —
 * maar hij mikt onverbiddelijk op precies jouw punt, en dat leest als een
 * aanwijzer met een draak eraan.
 *
 * Ertussen zit nu dit, en het doet twee dingen die los van elkaar staan:
 *
 *   Achterlopen. De cursor die hij nájaagt is een oudere versie van de jouwe.
 *   Dat is iets anders dan de demping die de vlucht al doet: die maakt de
 *   beweging zacht, dit maakt hem te laat. Zwenk je snel heen en weer, dan haalt
 *   hij de omkeerpunten niet meer en snijdt hij de bocht af — precies wat een
 *   dier doet dat achter iets aan zit.
 *
 *   Eromheen hangen. Hij mikt niet op jouw punt maar op een plek ernaast, en
 *   die plek draait langzaam om je heen. Daardoor komt hij van links, dan van
 *   rechts, dan er iets onder, zonder dat er ooit een moment is waarop hij
 *   stilstaat omdat hij "er is".
 *
 * De draaiing is niet zuiver rond. Een cirkel op een vast tempo is precies zo
 * mechanisch als eroverheen liggen, alleen op een andere manier — je ziet de
 * periode binnen een halve minuut. Er ligt daarom ruis op zowel de hoek als de
 * straal, en dat maakt het een dwaalbaan in plaats van een baan.
 *
 * De verticale kant van die baan is met opzet kleiner dan de horizontale. Naar
 * voren komen kost hem vleugelslagen en naar achteren is zweven; een baan die
 * even hoog als breed is laat hem dus voortdurend slaan om een rondje te maken,
 * en dan hoor je het gedrag in plaats van het te zien.
 *
 * ## Als je weg bent
 *
 * Er is één pad en geen tweede geval. Ben je er niet, dan is het punt waar hij
 * omheen hangt niet jouw cursor maar een eigen dwaalpunt, en daar schuift hij
 * met een veel tragere hand naartoe. Verder verandert er niets: dezelfde baan,
 * dezelfde beweging, alleen een ander middelpunt en een ander tempo.
 *
 * Dat is met opzet zo gebouwd, want de vorige opzet had twee harde
 * onderbrekingen. Vertrok je met je muis, dan viel het mikpunt weg en verschoof
 * zijn doel in één frame naar het midden; kwam je terug, dan klapte het
 * spoorpunt meteen op je cursor. Twee sprongen in iets wat een vloeiende
 * beweging hoort te zijn, en precies die twee voelden happerig. Nu is er
 * niets om te wisselen: het middelpunt verschuift geleidelijk en de rest loopt
 * door.
 *
 * Pure functies over getallen, zodat het te testen is zonder three.js.
 */
export type PursuitState = {
  /**
   * Het punt waar hij omheen hangt: jouw cursor achterlopend, of zijn eigen
   * dwaalpunt als je er niet bent.
   *
   * Alleen null vóór hij ooit een cursor gezien heeft. Daarna blijft hij staan,
   * ook als je vertrekt — dat is precies wat de sprong eruit haalt.
   */
  trailing: Vec2 | null
  elapsed: number
}

export const createPursuitState = (): PursuitState => ({ trailing: null, elapsed: 0 })

/**
 * Welk deel van de baanstraal hij naar voren en achteren gebruikt.
 *
 * Kleiner dan zijwaarts, want die as kost hem vleugelslagen. Zie de kop van dit
 * bestand.
 */
const ORBIT_FLATTEN = 0.62

/**
 * Hoeveel de straal varieert, als deel van zichzelf, en hoe traag dat gaat.
 *
 * Ruim, en met opzet traag. Hierdoor zijn er stukken waarin hij dicht bij je
 * blijft en stukken waarin hij ver uitwijkt, in plaats van altijd op dezelfde
 * afstand. Ging het snel, dan zou de afstand zenuwachtig pompen; zo duurt een
 * uitstap tientallen seconden en leest het als een besluit.
 */
const RADIUS_WANDER = 0.85
const RADIUS_RATE = 0.06

/**
 * Hoeveel keer `orbitRadius` de baan op zijn wijdst wordt.
 *
 * Staat hier zodat een test hem kan lezen in plaats van hem over te schrijven;
 * anders loopt zo'n grens ongemerkt uit de pas met de constante erboven.
 */
export const WIDEST_ORBIT = 1 + RADIUS_WANDER

/** hoever de ruis de hoek van zijn gestage draai af mag trekken, in radialen */
const ANGLE_WANDER = 2.2

const TAU = Math.PI * 2

/**
 * Hoe ver zijn eigen dwaalpunt van het midden loopt, en hoe traag.
 *
 * Dit is waar hij omheen hangt als jij er niet bent. Traag genoeg dat het een
 * baan is en geen gedwaal, en ruim binnen het beeld zodat hij netjes staat als
 * er niemand kijkt.
 */
const ADRIFT_RANGE = 0.55
const ADRIFT_RATE = 0.045

/** waar hij zelf heen zou gaan, als je er niet bent */
const adrift = (elapsed: number): Vec2 => ({
  x: (noise(elapsed * ADRIFT_RATE + 7.7) * 2 - 1) * ADRIFT_RANGE,
  y: (noise(elapsed * ADRIFT_RATE * 0.8 + 51.3) * 2 - 1) * ADRIFT_RANGE * ORBIT_FLATTEN,
})

/**
 * Eén stap. Geeft altijd een plek terug waar hij op mikt, ook als jij er niet
 * bent — dan is het zijn eigen dwaalpunt. Dat er nooit niets is, is precies wat
 * het weglopen en het terugkomen vloeiend houdt.
 */
export const stepPursuit = (
  state: PursuitState,
  cursor: Vec2 | null,
  config: PursuitConfig,
  delta: number,
): { state: PursuitState; aim: Vec2 } => {
  const elapsed = state.elapsed + delta

  /* Waar hij omheen wil hangen: jij, of zijn eigen dwaalpunt als je er niet
     bent. Eén pad, geen tweede geval — dat is wat de sprongen eruit haalt. */
  const anchor = cursor ?? adrift(elapsed)

  /* Vóór de allereerste cursor is er niets om vanaf te lopen; dan meteen erop,
     anders zie je hem bij het laden vanuit het midden aanvliegen. Daarna nooit
     meer, ook niet als je een tijd weg bent geweest: juist dán zou hij springen. */
  const previous = state.trailing ?? anchor

  /* Ben je weg, dan verliest hij je veel langzamer dan hij je volgt. Dat maakt
     het weglopen én het terugkomen geleidelijk. */
  const rate = cursor ? config.trailRate : config.releaseRate
  const lag = 1 - Math.exp(-rate * delta)
  const trailing = {
    x: previous.x + (anchor.x - previous.x) * lag,
    y: previous.y + (anchor.y - previous.y) * lag,
  }

  /* Een gestage draai met ruis eroverheen: de baan komt wel rond, maar nooit op
     dezelfde manier en nooit op hetzelfde moment. */
  const angle = elapsed * config.orbitRate * TAU + (noise(elapsed * 0.11) - 0.5) * ANGLE_WANDER
  const radius =
    config.orbitRadius *
    (1 - RADIUS_WANDER + noise(elapsed * RADIUS_RATE + 31.4) * RADIUS_WANDER * 2)

  return {
    state: { trailing, elapsed },
    aim: {
      x: trailing.x + Math.cos(angle) * radius,
      y: trailing.y + Math.sin(angle) * radius * ORBIT_FLATTEN,
    },
  }
}
