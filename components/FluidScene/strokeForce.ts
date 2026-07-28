import { screenToSimulationDirection } from './projection'
import type { Vec2 } from './types'

/**
 * De vleugelslag asymmetrisch maken, zodat er wind uitkomt in plaats van
 * geklots.
 *
 * Een roerpunt op een vleugel duwt nu even hard heen als terug. Over een hele
 * slag heffen die twee elkaar op: het veld schudt op zijn plek en er komt geen
 * richting uit. Een echte vleugel doet dat niet. Op de neerslag staat hij dwars
 * op de lucht en duwt hij die naar achteren, op de terugslag vouwt hij zich in
 * en glijdt hij er zo goed als krachteloos doorheen. Dat verschil is precies
 * waar voortstuwing vandaan komt.
 *
 * De slag wordt daarvoor uit elkaar gehaald langs één as, de windas: het deel
 * dat langs de as loopt en het deel dat er dwars op staat. Die twee zijn de
 * oorzaak van twee verschillende dingen op het scherm, en daarom krijgen ze
 * ieder hun eigen knop.
 *
 *   `bias` laat de slag tegen de wind in glijden in plaats van duwen. Dit deel
 *   is wat het spoor openbreekt: duwt de terugslag ook maar een beetje
 *   bovenwinds, dan loopt die tegen het spoor van de vorige neerslag in en
 *   wordt het rommelig. Op 0 verandert er niets en is het weer symmetrisch, op
 *   1 doet de terugslag helemaal geen werk meer.
 *
 *   `steering` kamt weg wat er dwars op de as gebeurt. Dat deel is waarom de
 *   wind naar opzij uitwaaiert in plaats van naar achteren te trekken. Helemaal
 *   dicht draaien moet je hem niet: wat er overblijft is precies wat het
 *   onrustig genoeg houdt om natuurlijk te blijven, en zonder dat wordt het een
 *   rechte muur in plaats van een wervel.
 *
 * De slag mee krijgt bewust geen versterking boven 1: dat de wind naar achteren
 * gaat overheersen komt doordat al het andere wegvalt, en de totale sterkte
 * blijft daarmee aan `objectForce` hangen in plaats van aan twee knoppen die
 * elkaar tegenwerken.
 *
 * Pure functies over vectoren, zodat de asymmetrie te testen is zonder three.js
 * en zonder een draaiende simulatie.
 */

/** onder deze lengte heeft een richting geen betekenis meer */
const EPSILON = 1e-9

/**
 * Hoe breed de overgang tussen de slag mee en de slag terug is, gemeten als
 * cosinus van de hoek met de windas.
 *
 * Smal, en dat is het hele punt. Een brede overgang loopt over de volle halve
 * cirkel en laat daardoor de halve slag terug alsnog duwen; precies dat maakte
 * de wind rommelig. Een harde schakelaar op het teken kan ook niet, want dan
 * klapt een punt dat vlak langs de as veegt van frame tot frame heen en weer.
 * Deze waarde is een band van een graad of vijftien weerszijden van dwars.
 */
const STROKE_BAND = 0.25

/** hermite tussen twee randen, zoals smoothstep in glsl */
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * De windas als eenheidsvector in de ruimte van de simulatie.
 *
 * `degrees` is een richting op het scherm: 0 wijst naar rechts, 90 naar boven.
 * Dit is de kant waar de wind naartoe waait, dus bij een draak die met zijn kop
 * naar boven staat is dat 270.
 */
export const windVector = (degrees: number, ratio: number): Vec2 => {
  const radians = (degrees * Math.PI) / 180
  const wind = screenToSimulationDirection(
    { x: Math.cos(radians), y: Math.sin(radians) },
    ratio,
  )

  const length = Math.sqrt(wind.x * wind.x + wind.y * wind.y)
  if (length < EPSILON) return { x: 0, y: 1 }

  return { x: wind.x / length, y: wind.y / length }
}

/**
 * De verplaatsing van een roerpunt omgerekend naar de kracht die het echt in
 * het veld mag zetten. `wind` hoort een eenheidsvector te zijn, uit
 * `windVector`.
 */
export const strokeForce = (force: Vec2, wind: Vec2, bias: number, steering: number): Vec2 => {
  const length = Math.sqrt(force.x * force.x + force.y * force.y)
  if (length < EPSILON) return { x: 0, y: 0 }

  /* de slag ontleed langs de windas: hoeveel er langs de as loopt, en wat er
     dwars op overblijft */
  const along = force.x * wind.x + force.y * wind.y
  const acrossX = force.x - wind.x * along
  const acrossY = force.y - wind.y * along

  /* 0 is volledig tegen de wind in, 1 volledig mee */
  const downwind = smoothstep(-STROKE_BAND, STROKE_BAND, along / length)

  /* de slag terug glijdt in plaats van te duwen. Dit geldt voor de hele slag en
     niet alleen voor zijn deel langs de as: een vleugel die zich invouwt doet
     ook opzij nauwelijks nog werk, en dat is de andere helft van de rommel. */
  const slip = 1 - bias * (1 - downwind)

  return {
    x: (wind.x * along + acrossX * (1 - steering)) * slip,
    y: (wind.y * along + acrossY * (1 - steering)) * slip,
  }
}
