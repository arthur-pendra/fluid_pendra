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
 *   vliegen   het gewone gedrag; hier wacht hij tot je aandacht wegvalt
 *   duiken    naar beneden uit beeld, met de vleugels ingeklapt
 *   weg       even niets, zodat de leegte gezien wordt
 *   invliegen van een willekeurige zijkant terug naar binnen
 *
 * Wat hem laat duiken is dat jij er niet meer bent: de cursor staat stil of is
 * het beeld uit. En wat hem terughaalt is dat je weer beweegt. Daarmee is de
 * manoeuvre een antwoord en geen klok die afloopt, en dat is het verschil tussen
 * een draak die zich verveelt en een metronoom. Het kost hem ook niets om weg te
 * zijn zolang er niemand kijkt, en het levert je de terugkomst op als beloning
 * voor de eerste beweging.
 *
 * Het beginnen zelf hangt niet aan die aanleiding maar aan de vleugels: hij gaat
 * op een slaggrens en nergens anders, want een duik hoort een zet onder zich te
 * hebben. Zweeft hij op dat moment, dan slaat hij er eerst een.
 *
 * De oude ronde op vleugelslagen staat er nog naast en is standaard uit. Wil je
 * hem toch af en toe zien duiken terwijl je bezig bent, dan zet je `diveEvery`
 * boven nul; in slagen en niet in seconden, want hij slaat harder als hij
 * vooruit moet en dan komt de duik in drukke stukken vanzelf eerder.
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
  /**
   * Of je je sinds zijn vertrek hebt laten zien.
   *
   * Een geheugen en geen momentopname, en dat verschil is een gat waar hij in
   * viel: bewoog je terwijl hij zijn `awayTime` nog moest uitzitten, dan was dat
   * moment allang voorbij tegen de tijd dat hij mocht komen. Stond je dan weer
   * stil, dan wachtte hij op een beweging die je net gedaan had, en bleef hij
   * weg terwijl jij naar een leeg scherm zat te kijken.
   */
  seen: boolean
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
  seen: false,
})

/** hoe ver buiten beeld hij moet zijn voordat hij als verdwenen telt */
const MARGIN = 0.6

/** hoeveel sneller de diepte terugloopt dan de oversteek bij het invliegen */
const DEPTH_LEAD = 3

export type DiveInput = {
  /**
   * Of jij er even niet bent: de cursor staat stil of staat buiten het beeld.
   * Dit laat hem duiken, en het houdt hem weg zolang het waar blijft.
   */
  idle: boolean
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
  { idle, beatsAdvanced, flying, bounds, delta, random }: DiveInput,
): DiveState => {
  const elapsed = state.elapsed + delta

  /* Eén beweging is genoeg, en die hoeft niet te vallen op het moment dat hij
     toevallig mag komen. Zie `seen` in DiveState voor waarom dat een geheugen
     moet zijn. */
  const seen = state.seen || !idle

  if (state.stage === 'flying') {
    const beats = state.beats + beatsAdvanced

    /* Twee redenen om te gaan, en de eerste is de gewone: je bent er niet meer.
       Dan is er ook niets meer om te volgen, en wegduiken zegt dat beter dan
       rondjes blijven vliegen boven een lege muis.

       De teller ernaast is de oude vaste ronde; op nul of minder duikt hij daar
       nooit van, en zo staat hij standaard. */
    const wants = idle || (config.diveEvery > 0 && beats >= config.diveEvery)

    /* Maar hoe dan ook pas op een slaggrens. Een duik die uit een zweefstand
       begint heeft niets onder zich: hij begint op `diveSpeed` alsof die vaart
       er al was, en die vlieger gaat alleen op als er net een vleugel geduwd
       heeft. Zonder dat kantelt de neus wel maar valt hij als een steen, en dat
       is precies waar het naar uitziet ook.

       Zweeft hij op het moment dat hij wil gaan, dan komt die grens niet vanzelf
       voorbij: dan staat de clip stil. `diveNeedsBeat` zegt de aanroeper daarom
       dat de vleugels aan het werk moeten, en één slag later is dit waar. */
    if (wants && beatsAdvanced > 0) {
      return {
        ...state,
        stage: 'diving',
        beats: 0,
        elapsed: 0,
        place: { ...flying },
        depth: 0,
        fall: config.diveSpeed,
        pitch: 0,
        /* schone lei: vanaf hier telt of je je nog laat zien */
        seen: false,
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
      return { ...state, stage: 'away', elapsed: 0, place, depth, fall, pitch, seen }
    }

    return { ...state, elapsed, place, depth, fall, pitch, seen }
  }

  if (state.stage === 'away') {
    /* Eerst de vaste tijd uitzitten, want de leegte hoort gezien te worden, en
       daarna wachten tot je je hebt laten zien. Doe je niets, dan blijft hij weg:
       terugkomen voor een stilstaande cursor is precies het tegenovergestelde
       van wat de duik moet zeggen. */
    if (elapsed < config.awayTime || !seen) return { ...state, elapsed, seen }

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

  /* invliegen: van de zijkant naar binnen, tot hij in zijn bereik zit.

     Naar het midden toe en niet naar de cursor, en dat blijft zo: dit is de
     geschreven baan, en die hoort een vaste vorm te hebben. Dat hij onderweg
     tóch alvast naar je hand buigt komt van `diveControl`, dat deze baan
     geleidelijk laat wegwegen tegen het gewone vliegen. Zou de cursor hier
     binnenkomen, dan zou de aankomst afhangen van waar jij hem laat staan en
     kan hij er bij een bewegende muis nooit zijn. */
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

/**
 * Hoeveel de duik op dit moment over zijn plek te zeggen heeft, 1 tot 0.
 *
 * Een verloop en geen schakelaar, en dat is met opzet. De overgave op één punt
 * leggen ligt voor de hand, maar dan valt hij precies verkeerd: het invliegen
 * dooft uit naar het midden toe, dus op het moment van de wissel staat hij
 * bijna stil, en het vliegen begint met de volle achterstand naar de cursor.
 * Doorgemeten kwam de zijwaartse snelheid daar in één frame van 0,09 naar 1,60
 * eenheden per seconde, en de kanteling sloeg mee om. Dát is wat je ziet als
 * "hij vliegt in en zoekt dan opeens de muis".
 *
 * Dus geeft hij de besturing al onderweg terug. Buiten beeld is de manoeuvre
 * van hem alleen; vanaf de rand telt het vliegen mee, en tegen het midden heeft
 * dat het helemaal. Geëgaliseerd zodat ook de afgeleide op nul begint en
 * eindigt: dan zit er geen knik in de overgave zelf.
 *
 * De nul valt op `enterGap` en niet op het midden, want dat is waar het
 * invliegen ophoudt. Bleef er op dat punt nog een restje staan, dan viel dat er
 * bij de standwissel alsnog in één frame af — klein, maar precies het soort
 * sprongetje waar dit allemaal om begonnen is.
 */
export const diveControl = (state: DiveState, config: DiveConfig, bounds: Vec2): number => {
  if (state.stage === 'flying') return 0
  if (state.stage !== 'entering') return 1

  const span = Math.max(bounds.x - config.enterGap, 1e-6)
  const outside = Math.min(1, Math.max(0, (Math.abs(state.place.x) - config.enterGap) / span))
  return outside * outside * (3 - 2 * outside)
}

/**
 * Of de vleugels nú aan het werk moeten, los van of hij vooruit wil.
 *
 * Hij wil duiken maar mag dat alleen op een slaggrens, en die komt er niet
 * zolang hij zweeft: de clip staat dan stil in zijn wijdste stand. Dus slaat hij
 * er eerst een, en die ene slag is meteen de zet waar de duik op begint.
 */
export const diveNeedsBeat = (state: DiveState, idle: boolean): boolean =>
  state.stage === 'flying' && idle

/** of de vleugels ingeklapt horen te zijn: alleen tijdens het vallen zelf */
export const diveFoldsWings = (state: DiveState): boolean =>
  state.stage === 'diving' || state.stage === 'away'
