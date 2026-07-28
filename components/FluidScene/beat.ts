/**
 * De vleugels langer open houden zonder de clip te herschrijven.
 *
 * De draak zweeft al meer dan hij slaat — vier slagen in dertien seconden, zo'n
 * 0,3 Hz — maar de clip loopt op één tempo af, dus het zweven en het slaan
 * krijgen evenveel tijd. Een echte vogel doet het omgekeerde: die houdt zijn
 * vleugels lang gespreid en gaat er dan in één keer doorheen.
 *
 * Dat is te krijgen zonder één bot aan te raken, door de klok van de clip niet
 * gelijkmatig te laten lopen. Waar de vleugels langzaam bewegen gaat de clip
 * langzamer, waar ze snel bewegen sneller. Het is dus geen nieuwe beweging maar
 * een uitvergroting van wat de rigger er al in heeft gezet, en daarom blijft het
 * er ook uitzien als zijn animatie.
 *
 * Twee dingen komen daar gratis uit. De vleugel gaat op de slag harder door de
 * lucht, dus de gemeten slagkracht piekt hoger en de stuwkracht wordt sterker
 * precies op het moment dat hij hoort te komen. En de totale rondgang duurt even
 * lang als eerst, want de tijdschaal wordt zo genormaliseerd dat de clip er
 * netto even lang over doet — anders zou de knop ook het tempo verzetten.
 */

/**
 * De tijdschaal per bemonsteringspunt, uit de opgemeten vleugelsnelheid.
 *
 * `hold` is hoe scherp het onderscheid wordt: 0 laat de clip gelijkmatig lopen
 * zoals hij bedoeld is, 1 verdubbelt het verschil tussen zweven en slaan.
 */
export const beatProfile = (speeds: number[], hold: number): number[] => {
  if (speeds.length === 0) return []

  const total = speeds.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return speeds.map(() => 1)

  const mean = total / speeds.length
  /* de snelheid ten opzichte van het gemiddelde, tot de macht `hold`. Onder de
     wortel afkappen zodat een stilstaand moment de klok niet stilzet. */
  const raw = speeds.map((speed) => Math.pow(Math.max(speed / mean, 0.05), hold))

  /* De tijd die de clip in het echt kost is de som van 1/schaal. Delen door het
     gemiddelde daarvan houdt die som gelijk, dus de rondgang duurt even lang en
     `hold` verzet alleen de verdeling erbinnen. */
  const inverse = raw.reduce((sum, value) => sum + 1 / value, 0) / raw.length

  return raw.map((value) => value * inverse)
}

/**
 * De tijdschaal op een plek in de clip, met de uiteinden aan elkaar: een clip
 * die rondloopt mag bij het omslagpunt geen sprong maken.
 *
 * `phase` loopt van 0 tot 1 en mag daarbuiten liggen.
 */
export const sampleProfile = (profile: number[], phase: number): number => {
  if (profile.length === 0) return 1
  if (profile.length === 1) return profile[0]

  const wrapped = ((phase % 1) + 1) % 1
  const position = wrapped * profile.length
  const index = Math.floor(position)
  const blend = position - index

  const here = profile[index % profile.length]
  const next = profile[(index + 1) % profile.length]

  return here + (next - here) * blend
}
