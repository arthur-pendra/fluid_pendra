import type { PointMotion } from './types'

/**
 * Welke punten op het oppervlak van een geanimeerd model de vloeistof roeren.
 *
 * Een geanimeerd model beweegt zichzelf al, en veel harder dan het ooit zou
 * drijven: een vleugelpunt legt per slag meer weg af dan het hele object in een
 * hele driftcirkel. Dat is dus een betere bron voor de roerpunten dan een lijn
 * door een stilstaand object. Alleen moet je de juiste punten kiezen, en bij
 * twaalfduizend vertices en zeven roerpunten is dat echt kiezen.
 *
 * Let op waarom dit over oppervlaktepunten gaat en niet over botten, want dat
 * lijkt de kortere weg. De botten van een glTF-model staan in hun eigen ruimte,
 * en het verschil met de plek waar het model verschijnt zit in de inverse bind
 * matrices. Bij deze draak liggen de botten tien eenheden boven de zichtbare
 * mesh, achter de camera langs. Waar een punt echt uitkomt weet je pas na
 * skinning, en dat is precies wat je hier nodig hebt.
 *
 * Twee eisen die tegen elkaar in trekken. Een punt moet veel bewegen, anders
 * roert het niets. En de gekozen punten moeten uit elkaar liggen, anders zitten
 * alle roerpunten in dezelfde vleugelpunt en blijft de rest van het model
 * onzichtbaar. Puur op amplitude kiezen geeft het eerste probleem, puur op
 * spreiding geeft punten op de romp, en die staat stil.
 *
 * Dit is een pure functie over opgemeten bewegingen, zodat de keuze te testen
 * is zonder three.js en zonder een echt model.
 */

/** punten die minder dan dit deel van de sterkste beweging maken doen niet mee */
const MIN_AMPLITUDE = 0.15

/**
 * Hoe zwaar spreiding meeweegt tegenover amplitude, 0 tot 1.
 *
 * Vrij hoog, en met opzet. De vleugelpunten bewegen zo veel harder dan al het
 * andere dat een lagere waarde alle roerpunten op twee plekken legt: dan zie je
 * twee vegen in plaats van een draak.
 */
const SPREAD_WEIGHT = 0.8

const distance = (a: PointMotion['center'], b: PointMotion['center']) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Geeft de indexen van de punten die mogen roeren, sterkste eerst. Zijn er
 * minder bruikbare punten dan gevraagd, dan komen er ook minder terug: liever
 * een roerpunt minder dan twee punten op dezelfde plek.
 */
export const pickStirPoints = (points: PointMotion[], count: number): number[] => {
  if (count <= 0) return []

  const strongest = points.reduce((max, point) => Math.max(max, point.amplitude), 0)
  if (strongest <= 0) return []

  const candidates = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.amplitude >= strongest * MIN_AMPLITUDE)

  /* de maat waarop de spreiding genormaliseerd wordt, anders hangt de weging
     tussen de twee eisen aan de schaal van het model */
  let extent = 0
  for (let a = 0; a < candidates.length; a++) {
    for (let b = a + 1; b < candidates.length; b++) {
      extent = Math.max(extent, distance(candidates[a].point.center, candidates[b].point.center))
    }
  }

  const chosen: number[] = []
  const taken = new Set<number>()
  const wanted = Math.min(count, candidates.length)

  while (chosen.length < wanted) {
    let best = -1
    let bestScore = -Infinity

    for (const { point, index } of candidates) {
      if (taken.has(index)) continue

      /* afstand tot het dichtstbijzijnde punt dat al gekozen is; de eerste keer
         is er niets om vanaf te liggen, dus dan telt alleen de amplitude */
      const spread =
        chosen.length === 0 || extent === 0
          ? 1
          : Math.min(...chosen.map((other) => distance(point.center, points[other].center))) / extent

      const score = (1 - SPREAD_WEIGHT) * (point.amplitude / strongest) + SPREAD_WEIGHT * spread

      if (score > bestScore) {
        bestScore = score
        best = index
      }
    }

    chosen.push(best)
    taken.add(best)
  }

  return chosen
}
