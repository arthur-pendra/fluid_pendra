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
 *
 * ## Overgaan naar zweven
 *
 * Hoeft hij niet vooruit, dan moeten de vleugels gespreid blijven. De eerste
 * opzet vertraagde daarvoor de hele clip, en dat zag er verkeerd uit: je zag een
 * draak die in slow motion doorklapwiekte in plaats van een die ophield met
 * slaan. De slag hoort zijn eigen tempo te houden.
 *
 * Wat er wél moet gebeuren is dat hij de slag waar hij in zit gewoon afmaakt en
 * daarna tot stilstand komt met de vleugels gespreid. Zulke standen zijn te
 * vinden: het zijn de momenten waarop het oppervlak het minst beweegt, en dat is
 * al opgemeten.
 *
 * Het zijn er meerdere, en dat is het hele punt. Deze clip heeft vier slagen, dus
 * ook vier zweefstanden. Met maar één ervan als mikpunt moest hij soms drie
 * slagen door voordat hij mocht stoppen — en dat is precies hoe het eruitzag:
 * vleugels die maar blijven doorgaan terwijl je je muis al lang achter hem hebt.
 * Hij mikt daarom op de eerstvolgende, en wacht dus hooguit één slag.
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

/**
 * Onder welk deel van de gemiddelde beweging een moment als zweven telt.
 *
 * Ruim onder 1, want het gaat om de dalen tussen de slagen. Hoger en er valt
 * ook een stuk van de op- en afgaande slag onder, en dan stopt hij met zijn
 * vleugels halverwege.
 */
const SOAR_LEVEL = 0.6

/**
 * De plekken in de clip waar de vleugels het verst gespreid staan: de standen
 * waarin hij tot stilstand mag komen.
 *
 * Dat zijn de bemonsteringspunten waar het oppervlak duidelijk trager beweegt
 * dan gemiddeld. Een vogel die zich laat dragen hangt precies daar, en het is de
 * enige soort stand waar stilstaan er niet uitziet als een bevroren animatie.
 *
 * Niet op lokale minima gezocht, en dat is met opzet. Het zweefdeel van een slag
 * is een plateau, dus dan telt elk punt erop mee als dal en heb je er twintig in
 * plaats van vier. Dat is ook niet erg — elk traag moment is een prima plek om te
 * blijven hangen, en meer plekken betekent korter wachten — maar dan kan de test
 * ze net zo goed als drempelwaarde beschrijven, want dát is wat het is.
 */
export const soarPhases = (speeds: number[]): number[] => {
  if (speeds.length === 0) return []

  const mean = speeds.reduce((sum, value) => sum + value, 0) / speeds.length
  if (mean <= 0) return [0.5]

  const found: number[] = []
  for (let index = 0; index < speeds.length; index++) {
    /* midden op het bemonsteringsvak, want het monster dekt het stuk erna */
    if (speeds[index] < mean * SOAR_LEVEL) found.push((index + 0.5) / speeds.length)
  }

  /* een clip die overal even hard beweegt heeft geen stand die zich aandient */
  return found.length > 0 ? found : [0.5]
}

/**
 * De plek in de clip waar de vleugels het strakst tegen het lijf liggen.
 *
 * Dat is een ándere vraag dan die van `soarPhases`, en het verschil is precies
 * waar het om gaat: zweven is de vleugel op zijn wijdst en zo goed als stil,
 * ingeklapt is hem op zijn smalst. Op snelheid zoeken vindt de eerste, dus voor
 * de tweede wordt de spanwijdte zelf opgemeten.
 *
 * `spans` is per bemonsteringspunt de breedte van het model over de as waar de
 * vleugels overheen staan.
 */
export const foldPhase = (spans: number[]): number => {
  if (spans.length === 0) return 0

  let narrowest = 0
  for (let index = 1; index < spans.length; index++) {
    if (spans[index] < spans[narrowest]) narrowest = index
  }

  /* midden op het bemonsteringsvak, net als bij de zweefstanden */
  return (narrowest + 0.5) / spans.length
}

/**
 * De klok van de clip op een plek erin.
 *
 * Werken de vleugels, dan is dat gewoon het profiel: de clip loopt zijn slagen
 * af op zijn eigen tempo. Werken ze niet, dan loopt hij de slag waar hij in zit
 * nog gewoon af en remt in de laatste `brake` vóór de eerstvolgende zweefstand,
 * waar hij tot stilstand komt. `beating` mengt tussen die twee, dus het gaat in
 * elkaar over zonder sprong.
 *
 * Voorbijschieten kan niet: de snelheid loopt met het kwadraat van wat er nog te
 * gaan is naar nul, dus de stap wordt altijd veel kleiner dan de rest.
 */
export const clipRate = (
  profile: number[],
  soars: number[],
  phase: number,
  beating: number,
  brake: number,
): number => {
  const shape = sampleProfile(profile, phase)
  if (beating >= 1 || soars.length === 0) return shape

  /* de eerstvolgende zweefstand, dus hij wacht hooguit één slag; met alleen de
     verste zou hij de hele rondgang moeten uitzitten voordat hij mag stoppen */
  let ahead = Infinity
  for (const soar of soars) {
    ahead = Math.min(ahead, (((soar - phase) % 1) + 1) % 1)
  }

  /* Lineair en niet met een smoothstep erop. Die laatste gaat vlak bij nul als
     het kwadraat, en dan kruipt hij de laatste graden nog seconden lang door —
     precies wat "langzaam tot stilstand komen" is. Lineair geeft een gewone
     exponentiële nadering met een tijdconstante van `brake` maal de duur van de
     rondgang, dus hij staat binnen een fractie van een seconde stil. En
     voorbijschieten kan nog steeds niet: de stap is evenredig met wat er nog te
     gaan is, dus altijd kleiner dan de rest. */
  const approach = Math.min(1, ahead / Math.max(brake, 1e-6))

  return shape * (approach + (1 - approach) * beating)
}
