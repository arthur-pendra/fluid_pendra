import type { DiveConfig, Vec2 } from './types'

/**
 * De duik: om de zoveel vleugelslagen laat hij zich vallen, verdwijnt onder het
 * beeld, en komt even later van opzij weer ingevlogen.
 *
 * Dit staat naast `flight.ts` en niet erin, en dat is met opzet. Vliegen is daar
 * een evenwicht: hij volgt de cursor, kantelt mee, en de vleugels leveren de zet
 * die hem vooruit brengt. Een duik is het tegenovergestelde, namelijk een vaste
 * beweging die hij afmaakt en waar de cursor even niets over te zeggen heeft.
 * Die twee in één functie zetten zou van beide een reeks uitzonderingen maken.
 *
 * Vier standen, en ze lopen altijd in dezelfde volgorde rond:
 *
 *   vliegen   het gewone gedrag; hier worden de slagen geteld
 *   duiken    naar beneden uit beeld, met de vleugels ingeklapt
 *   weg       even niets, zodat de leegte gezien wordt
 *   invliegen van een willekeurige zijkant terug naar binnen
 *
 * Het aftellen gebeurt in slagen en niet in seconden. Dat is het verschil tussen
 * een draak die af en toe duikt en een metronoom: hij slaat harder als hij
 * vooruit moet, dus in drukke stukken komt de duik eerder. En de duik zelf begint
 * op een slaggrens, want dat is precies "net na een vleugelslag".
 *
 * Pure functies over getallen, zodat het te testen is zonder three.js. De
 * willekeur komt als parameter binnen om diezelfde reden.
 */

export type DiveStage = 'flying' | 'diving' | 'away' | 'entering'

export type DiveState = {
  stage: DiveStage
  /** slagen sinds de vorige duik; telt alleen in 'flying' */
  beats: number
  /** tijd in de huidige stand, in seconden */
  elapsed: number
  /**
   * Waar hij hangt tijdens de manoeuvre. In 'flying' loopt dit mee met wat
   * `flight.ts` doet, zodat de duik begint waar hij op dat moment is.
   */
  place: Vec2
  /**
   * Hoe ver hij onder het vliegvlak zit, dus van de camera af. Negatief.
   *
   * Dit is de hele reden dat een duik als duiken leest: de camera kijkt recht
   * naar beneden, dus wég is langs de kijkas en niet over het scherm. Perspectief
   * doet dan het werk, en omdat hij alleen zichtbaar is waar hij de vloeistof
   * roert lost hij vanzelf op zodra hij klein en ingeklapt is.
   */
  depth: number
  /** snelheid waarmee hij wegvalt, bouwt op tijdens het duiken */
  fall: number
  /** neus omlaag, in graden; 0 is vlak, -90 is recht de diepte in */
  pitch: number
  /** de kant waar hij terugkomt: -1 links, 1 rechts */
  side: number
  /** de hoogte waarop hij terugkomt */
  entry: number
}

export const createDiveState = (): DiveState => ({
  stage: 'flying',
  beats: 0,
  elapsed: 0,
  place: { x: 0, y: 0 },
  depth: 0,
  fall: 0,
  pitch: 0,
  side: 1,
  entry: 0,
})

/** hoe ver buiten beeld hij moet zijn voordat hij als verdwenen telt */
const MARGIN = 0.6

/** hoeveel sneller de diepte terugloopt dan de oversteek bij het invliegen */
const DEPTH_LEAD = 3

export type DiveInput = {
  /** hoeveel hele vleugelslagen er sinds de vorige stap voorbij zijn */
  beatsAdvanced: number
  /** waar `flight.ts` hem op dit moment heeft; het startpunt van de duik */
  flying: Vec2
  /** de halve breedte en hoogte van het zichtbare vlak */
  bounds: Vec2
  delta: number
  /** 0 tot 1; als parameter zodat een test hem kan vastzetten */
  random: () => number
}

/**
 * Eén stap.
 *
 * Zolang hij vliegt volgt `place` gewoon de vlucht, zodat de duik begint waar
 * hij op dat moment hangt en niet ergens anders vandaan.
 */
export const stepDive = (
  state: DiveState,
  config: DiveConfig,
  { beatsAdvanced, flying, bounds, delta, random }: DiveInput,
): DiveState => {
  const elapsed = state.elapsed + delta

  if (state.stage === 'flying') {
    const beats = state.beats + beatsAdvanced

    /* op nul of minder duikt hij nooit, dan is de manoeuvre uit */
    if (config.diveEvery > 0 && beats >= config.diveEvery) {
      return {
        ...state,
        stage: 'diving',
        beats: 0,
        elapsed: 0,
        place: { ...flying },
        depth: 0,
        fall: config.diveSpeed,
        pitch: 0,
      }
    }

    return { ...state, beats, elapsed, place: { ...flying }, depth: 0, pitch: 0 }
  }

  if (state.stage === 'diving') {
    /* De neus gaat eerst en het wegvallen komt daarna: hij hoort niet weg te
       zakken terwijl hij nog vlak ligt.

       Geëgaliseerd over een vaste tijd en niet exponentieel naar -90 toe. Een
       exponentiële nadering heeft zijn hoogste snelheid meteen bij het begin, en
       dat is precies wat een overgang "opeens" maakt: de neus klapt om in plaats
       van over te hellen. Deze ramp begint op nul snelheid, versnelt in het
       midden en komt weer op nul uit, dus de kanteling zet in en dooft uit. */
    const ramp = Math.min(1, elapsed / Math.max(config.pitchTime, 1e-6))
    const eased = ramp * ramp * (3 - 2 * ramp)
    const pitch = -90 * eased
    const nosed = eased

    /* Geen knik naar beneden maar een boog, en dat is één ingreep: de
       snelheidsvector draait mee met de neus. Bij vlak liggen gaat alles nog
       vooruit, bij de neus recht omlaag alles de diepte in, en daartussenin
       verdeelt de cosinus het vanzelf. Zo houdt hij zijn vaart uit de laatste
       slag en buigt hij er doorheen in plaats van los te laten.

       Hij begint dan ook niet op nul maar op `diveSpeed`, want die vaart had hij
       al. De versnelling komt er pas bij naarmate hij staat. */
    const heading = (pitch * Math.PI) / 180
    const fall = state.fall + config.diveAcceleration * nosed * delta

    /* vooruit is op het scherm omhoog, en `y` is de z-as die daar andersom
       loopt, dus vooruit betekent dat `y` daalt */
    const place = { x: state.place.x, y: state.place.y - fall * Math.cos(heading) * delta }
    const depth = state.depth + fall * Math.sin(heading) * delta

    if (depth < -config.diveDepth) {
      return { ...state, stage: 'away', elapsed: 0, place, depth, fall, pitch }
    }

    return { ...state, elapsed, place, depth, fall, pitch }
  }

  if (state.stage === 'away') {
    if (elapsed < config.awayTime) return { ...state, elapsed }

    /* links of rechts, en op een willekeurige hoogte binnen zijn bereik, zodat
       je niet ziet aankomen waar hij vandaan komt */
    const side = random() < 0.5 ? -1 : 1
    const entry = (random() * 2 - 1) * bounds.y * 0.5

    return {
      ...state,
      stage: 'entering',
      elapsed: 0,
      side,
      entry,
      place: { x: side * (bounds.x + MARGIN), y: entry },
      /* net áchter de fog beginnen en niet op duikdiepte. Kwam hij van twaalf
         eenheden terug, dan zat hij het grootste deel van de oversteek nog in de
         mist en kwam hij pas vlak bij het midden tevoorschijn — dan zie je geen
         draak die van opzij binnenvliegt maar eentje die in het midden opduikt. */
      depth: -config.fogDepth * 1.4,
      fall: 0,
      pitch: 0,
    }
  }

  /* invliegen: van de zijkant naar binnen, tot hij in zijn bereik zit. Naar het
     midden toe en niet naar de cursor: die neemt het pas weer over als hij
     binnen is, anders krijgt hij halverwege alsnog een ruk. */
  const target = { x: 0, y: state.entry }
  const step = 1 - Math.exp(-config.enterRate * delta)
  const place = {
    x: state.place.x + (target.x - state.place.x) * step,
    y: state.place.y + (target.y - state.place.y) * step,
  }
  /* De diepte loopt sneller terug dan de oversteek: hij hoort uit de mist te
     komen terwijl hij nog bij de rand is, en daarna zichtbaar naar binnen te
     vliegen. Even snel als de oversteek zelf en hij vervaagt de halve reis. */
  const rising = 1 - Math.exp(-config.enterRate * DEPTH_LEAD * delta)
  const depth = state.depth + (0 - state.depth) * rising

  if (Math.abs(place.x - target.x) < config.enterGap) {
    return { ...state, stage: 'flying', beats: 0, elapsed: 0, place, depth: 0, pitch: 0 }
  }

  return { ...state, elapsed, place, depth, pitch: 0 }
}

/** of de cursor op dit moment iets te zeggen heeft over waar hij hangt */
export const diveHoldsControl = (state: DiveState): boolean => state.stage !== 'flying'

/** of de vleugels ingeklapt horen te zijn: alleen tijdens het vallen zelf */
export const diveFoldsWings = (state: DiveState): boolean =>
  state.stage === 'diving' || state.stage === 'away'
