import type { ThrustConfig } from './types'

/**
 * De draak zichzelf een zetje laten geven bij elke vleugelslag.
 *
 * Bij de vis van Immersive Garden loopt dit de andere kant op: daar stuurt een
 * boid de snelheid aan en volgt de staartslag daaruit, `oscillationPower` is
 * niets anders dan de snelheid maal een factor. Dat kan omdat die vis
 * procedureel buigt. Onze draak brengt een gebakken clip mee, dus daar valt
 * niets uit te sturen: de slag ligt vast en de stuwkracht moet er juist uit
 * afgeleid worden.
 *
 * Meten hoeft niet apart te gebeuren, want die meting ligt er al. Voor de wind
 * wordt per roerpunt al uitgerekend hoeveel van zijn beweging benedenwinds
 * gaat, en dat is precies het signaal dat we zoeken: het piekt tijdens de
 * neerslag en valt weg tijdens de terugslag. Dat is dezelfde derde wet die de
 * wind zelf verklaart, nu andersom gelezen: duwt de vleugel lucht naar
 * achteren, dan gaat de draak naar voren.
 *
 * ## Waarom dit een signaal is en geen plek
 *
 * Eerst verschoof dit de draak een stukje naar voren en veerde het terug. Dat
 * klopte toen hij stil op de oorsprong hing. Nu hij zelf vliegt is een tweede
 * plek ernaast onzin: een slag hoort hem niet te verschuiven maar te versnellen.
 * Wat hier uitkomt is daarom 0 tot 1 — hoeveel slag er op dit moment in zit — en
 * `flight.ts` maakt daar met `beatBoost` snelheid van.
 *
 * ## Waarom hier geen veer met massa staat
 *
 * De eerste opzet was de natuurkundige: kracht optellen bij een snelheid,
 * weerstand eraf, en een veer die terugtrekt naar het midden. Doorgerekend op
 * een slag van anderhalve hertz gaf dat 0,3% beeldhoogte aan wiebel op een
 * uitslag van 4%. Oftewel: de draak ging een stukje vooruit staan en bleef daar
 * hangen, precies wat het niet moest worden.
 *
 * Dat is geen kwestie van afstellen. Massa met een veer is een laagdoorlaat van
 * de tweede orde, en die dempt alles boven zijn eigen frequentie met het
 * kwadraat van de verhouding. De slag zit ver boven die frequentie, dus de
 * losse duwtjes worden uitgemiddeld tot een constante verschuiving. Het
 * meebewegen zou pas zichtbaar worden door de veer op de slagfrequentie af te
 * stemmen, en die staat in de clip en nergens in de code.
 *
 * Daarom volgt de uitslag de slag rechtstreeks, met vertraging. Dat is
 * frequentie-onafhankelijk: bij welk tempo de vleugels ook slaan, de draak
 * loopt er met hetzelfde gewicht achteraan. De vertraging is wat het als duwen
 * laat lezen in plaats van als pulseren — zonder is de uitslag een kopie van de
 * slag en oogt het mechanisch.
 *
 * Pure functies over getallen, zodat het gedrag te testen is zonder three.js en
 * zonder een draaiende simulatie.
 */
export type ThrustState = {
  /** hoeveel slag er nu in zit, 0 tot 1, met vertraging */
  boost: number
  /**
   * Langzaam zakkende piek van de gemeten slagkracht.
   *
   * Hoe hard een vleugelpunt over het scherm veegt hangt af van de clip, de
   * schaal van het model en het aantal roerpunten. Zonder deze piek zou
   * `beatBoost` aan al die drie hangen en moest je hem bij elk model opnieuw
   * zoeken. Afgezet tegen zijn eigen piek is het signaal 0 tot 1, wat het ook
   * is: hoeveel van deze slag er al in zit.
   */
  peak: number
}

/** onder deze slagkracht valt er niets te normaliseren */
const EPSILON = 1e-9

export const createThrustState = (): ThrustState => ({ boost: 0, peak: 0 })

/**
 * Eén stap. `push` is de opgemeten slagkracht van deze frame: het gemiddelde
 * benedenwindse deel van de beweging van de roerpunten, per seconde.
 */
export const stepThrust = (
  state: ThrustState,
  push: number,
  config: ThrustConfig,
  delta: number,
): ThrustState => {
  const peak = Math.max(push, state.peak * Math.exp(-config.thrustAdapt * delta))
  const stroke = peak > EPSILON ? Math.min(1, Math.max(0, push) / peak) : 0

  /* als e-macht en niet als vaste stap, zodat het tempo aan de tijd hangt en
     niet aan de framerate; een tab die net terugkomt heeft een grote delta en
     mag daar geen sprong van maken */
  const follow = 1 - Math.exp(-config.thrustResponse * delta)
  const boost = state.boost + (stroke - state.boost) * follow

  return { boost, peak }
}
