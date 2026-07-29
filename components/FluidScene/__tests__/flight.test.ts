import { describe, expect, it } from 'vitest'
import { createFlightState, noise, stepFlight, wrapAngle, type FlightState } from '../flight'
import type { FlightConfig, Vec2 } from '../types'

const config: FlightConfig = {
  reachSide: 0.65,
  reachAhead: 0.6,
  followRate: 1.5,
  beatThrust: 1.1,
  glideBack: 0.5,
  arriveGap: 0.04,
  beatRate: 2.5,
  driftAhead: 0.05,
  driftRate: 0.09,
  bankAngle: 25,
  bankRate: 2.4,
  rollAngle: 20,
  rollRate: 3.6,
  leanAngle: 6,
}

const STEP = 1 / 60

/* het zichtbare vlak op een breed venster; het bereik is er een deel van */
const HALF = { x: 1.78, y: 1 }
const reachOf = (over: FlightConfig): Vec2 => ({
  x: over.reachSide * HALF.x,
  y: over.reachAhead * HALF.y,
})

/**
 * Doorrekenen. `boost` staat standaard op een volle slag zodat het vooruitkomen
 * te meten is; wie het zweven wil zien zet hem op 0.
 */
const fly = (
  seconds: number,
  cursor: Vec2 | null | ((t: number) => Vec2 | null) = null,
  over = config,
  boost: number | ((t: number) => number) = 1,
) => {
  let state = createFlightState(over)
  const track: FlightState[] = []
  for (let frame = 0; frame < seconds * 60; frame++) {
    const time = frame * STEP
    state = stepFlight(
      state,
      over,
      typeof boost === 'function' ? boost(time) : boost,
      typeof cursor === 'function' ? cursor(time) : cursor,
      reachOf(over),
      STEP,
    )
    track.push(state)
  }
  return { state, track }
}

const spread = (values: number[]) => Math.max(...values) - Math.min(...values)

/* op het scherm is omhoog vooruit, en `y` is de z-as die daar andersom loopt */
const VOOR: Vec2 = { x: 0, y: -0.5 }
const ACHTER: Vec2 = { x: 0, y: 0.5 }

describe('op zichzelf mikken', () => {
  /**
   * Waar de duik de plek stuurt hoort het vliegen niets te willen. Dat doet het
   * door hem op zijn eigen plek te laten mikken, en dit legt vast dat dat ook
   * echt neutraal is: geen gat, dus niets om in te halen en niets om op te
   * kantelen.
   *
   * Het alternatief was `null`, en dat is níet neutraal — dat is "mik op het
   * midden". Zie de tweede test hieronder voor wat dat kostte.
   */
  const zelf = (seconds: number, from: Vec2) => {
    let state = { ...createFlightState(config), position: { ...from } }
    const track: FlightState[] = []
    for (let frame = 0; frame < seconds * 60; frame++) {
      state = stepFlight(state, config, 1, { ...state.position }, reachOf(config), STEP)
      track.push(state)
    }
    return track
  }

  it('laat hem staan waar hij is, ook ver van het midden', () => {
    const track = zelf(3, { x: 1.0, y: 0.4 })
    for (const step of track) expect(Math.abs(step.position.x - 1.0)).toBeLessThan(0.01)
  })

  it('kantelt en helt dan ook niet', () => {
    const track = zelf(3, { x: 1.0, y: 0.4 })
    for (const step of track) {
      expect(Math.abs(step.bank)).toBeLessThan(config.bankAngle * 0.02)
      expect(Math.abs(step.lean)).toBeLessThan(config.leanAngle * 0.02)
    }
  })

  it('trekt hem naar de rand van zijn bereik als hij daarbuiten hangt', () => {
    /* Op zichzelf mikken is neutraal binnen zijn bereik, maar niet erbuiten: daar
       kapt `wanted` het doel af op de rand. Bij het invliegen hángt hij daarbuiten,
       dus dit is de stand waarin hij binnenkomt.

       Dat het niet helemaal neutraal is, is hier juist goed. Hij komt van opzij
       naar binnen, en dit laat hem die kant op kantelen in plaats van vlak naar
       binnen te schuiven. Zonder dit leest het invliegen als een plaatje dat
       verschoven wordt. */
    const track = zelf(5, { x: 2.2, y: 0 })
    const edge = reachOf(config).x

    expect(track[track.length - 1].position.x).toBeGreaterThan(edge - 0.01)
    expect(track[track.length - 1].position.x).toBeLessThan(edge + 0.01)

    /* Hij komt van rechts en gaat dus naar links, en linksom is op het scherm de
       positieve kant op — dezelfde afspraak als in `stepFlight`. */
    const diepste = Math.max(...track.map((s) => s.bank))
    expect(diepste).toBeGreaterThan(4)
    expect(diepste).toBeLessThan(config.bankAngle)
  })

  it('geeft een vloeiender overgave dan omschakelen vanaf het midden', () => {
    /* Dit is de sprong die je zag bij het invliegen. De duik geeft de besturing
       geleidelijk terug; schakelt het doel op dat moment van het midden naar jouw
       cursor, dan staat er ineens een heel scherm achterstand en haalt hij die in
       met een zwieper. Schuift het doel van hemzelf naar jou, dan niet.

       Gemeten aan de grootste verandering in zijwaartse snelheid tussen twee
       frames — dat is wat een zwieper ís. */
    const cursor: Vec2 = { x: -1.8, y: 0 }
    const start: Vec2 = { x: 2.2, y: 0 }

    /* de overgave zoals `diveControl` hem doet: geëgaliseerd van 1 naar 0 */
    const control = (t: number) => {
      const ramp = Math.min(1, Math.max(0, t / 1.2))
      const eased = ramp * ramp * (3 - 2 * ramp)
      return 1 - eased
    }

    const run = (aimAt: (owned: number, here: Vec2) => Vec2 | null) => {
      let state = { ...createFlightState(config), position: { ...start } }
      let last = start.x
      let worst = 0
      let previous = 0

      for (let frame = 0; frame < 2.5 * 60; frame++) {
        const owned = control(frame * STEP)
        state = stepFlight(state, config, 1, aimAt(owned, state.position), reachOf(config), STEP)

        const speed = (state.position.x - last) / STEP
        if (frame > 0) worst = Math.max(worst, Math.abs(speed - previous) / STEP)
        previous = speed
        last = state.position.x
      }

      return worst
    }

    /* zoals het was: null tot de duik begint los te laten, dan pardoes de cursor */
    const omschakelen = run((owned) => (owned < 1 ? cursor : null))

    /* zoals het nu is: het mikpunt schuift van hemzelf naar de cursor */
    const schuiven = run((owned, here) => ({
      x: here.x + (cursor.x - here.x) * (1 - owned),
      y: here.y + (cursor.y - here.y) * (1 - owned),
    }))

    expect(schuiven).toBeLessThan(omschakelen * 0.5)
  })
})

describe('noise', () => {
  it('blijft tussen nul en een', () => {
    for (let step = 0; step < 2000; step++) {
      const value = noise(step * 0.37)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('loopt vloeiend, zonder sprongen tussen twee stappen', () => {
    let biggest = 0
    for (let step = 0; step < 4000; step++) {
      biggest = Math.max(biggest, Math.abs(noise(step * 0.01) - noise((step + 1) * 0.01)))
    }
    expect(biggest).toBeLessThan(0.1)
  })

  it('herhaalt zich niet op een vaste periode', () => {
    const first = Array.from({ length: 50 }, (_, index) => noise(index * 0.1))
    const later = Array.from({ length: 50 }, (_, index) => noise(500 + index * 0.1))
    const difference = first.reduce((sum, value, index) => sum + Math.abs(value - later[index]), 0)

    expect(difference).toBeGreaterThan(1)
  })
})

describe('wrapAngle', () => {
  it('legt elke hoek op -180 tot 180', () => {
    expect(wrapAngle(0)).toBe(0)
    expect(wrapAngle(190)).toBeCloseTo(-170, 9)
    expect(wrapAngle(-190)).toBeCloseTo(170, 9)
  })
})

describe('zijwaarts volgen', () => {
  it('gaat naar de cursor toe', () => {
    expect(fly(10, { x: 0.5, y: 0 }).state.position.x).toBeCloseTo(0.5, 3)
    expect(fly(10, { x: -0.5, y: 0 }).state.position.x).toBeCloseTo(-0.5, 3)
  })

  it('komt er met gewicht aan en springt er niet op', () => {
    const { track } = fly(2, { x: 0.5, y: 0 })
    expect(track[0].position.x).toBeLessThan(0.1)
  })

  it('gaat naar het midden als de cursor niet in beeld is', () => {
    let state = fly(10, { x: 0.5, y: 0 }).state
    for (let frame = 0; frame < 900; frame++) {
      state = stepFlight(state, config, 1, null, reachOf(config), STEP)
    }
    expect(state.position.x).toBeCloseTo(0, 2)
  })

  it('blijft binnen zijn bereik bij een cursor tegen de schermrand', () => {
    for (const state of fly(20, { x: 5, y: 0 }).track) {
      expect(state.position.x).toBeLessThanOrEqual(reachOf(config).x + 1e-9)
    }
  })
})

describe('vooruit kost slagen, achteruit niet', () => {
  it('komt vooruit als de cursor vóór hem staat', () => {
    /* vooruit is omhoog op het scherm, dus `y` moet dalen */
    expect(fly(10, VOOR).state.position.y).toBeLessThan(-0.3)
  })

  it('zakt terug als de cursor achter hem staat', () => {
    const vooruit = fly(10, VOOR).state
    let state = vooruit
    for (let frame = 0; frame < 60 * 20; frame++) {
      state = stepFlight(state, config, 1, ACHTER, reachOf(config), STEP)
    }
    expect(state.position.y).toBeGreaterThan(0.3)
  })

  it('komt niet vooruit zonder slag', () => {
    /* dit is het hele punt: geen slag, geen stuwkracht, dus hij blijft staan */
    const zonder = fly(10, VOOR, config, 0).state
    expect(Math.abs(zonder.position.y)).toBeLessThan(config.driftAhead + 1e-6)
  })

  it('zakt wél terug zonder slag, want zweven kost er geen', () => {
    /* een vogel klapwiekt niet om achteruit te zakken */
    const { state } = fly(20, ACHTER, config, 0)
    expect(state.position.y).toBeGreaterThan(0.3)
  })

  it('doet er langer over om terug te zakken dan om aan te zetten', () => {
    /* dezelfde afstand heen en terug, ruim buiten het bereik van de ruis zodat
       de drempel niet op het gewiebel valt */
    const heen = fly(30, VOOR).track.findIndex((state) => state.position.y < -0.3)
    const terug = fly(30, ACHTER).track.findIndex((state) => state.position.y > 0.3)

    expect(heen).toBeGreaterThan(0)
    expect(terug).toBeGreaterThan(heen * 3)
  })

  it('komt schoksgewijs vooruit en niet gelijkmatig', () => {
    /* een slag die eens per drie seconden komt, zoals de clip hem heeft. Tussen
       twee slagen door hoort hij stil te liggen. */
    const puls = (t: number) => (t % 3.3 < 0.6 ? 1 : 0)
    const { track } = fly(12, { x: 0, y: -0.55 }, config, puls)

    const stappen: number[] = []
    for (let index = 1; index < track.length; index++) {
      stappen.push(track[index - 1].position.y - track[index].position.y)
    }
    const stil = stappen.filter((step) => step < 1e-4).length

    expect(stil / stappen.length).toBeGreaterThan(0.5)
  })

  it('schiet niet voorbij zijn doel', () => {
    for (const state of fly(20, VOOR).track) {
      expect(state.position.y).toBeGreaterThan(VOOR.y - config.driftAhead - 1e-6)
    }
  })

  it('blijft binnen zijn bereik naar voren', () => {
    for (const state of fly(20, { x: 0, y: -5 }).track) {
      expect(state.position.y).toBeGreaterThanOrEqual(
        -reachOf(config).y - config.driftAhead - 1e-6,
      )
    }
  })

  it('hangt nooit helemaal stil, ook niet op zijn plek', () => {
    const { track } = fly(300, { x: 0, y: 0 }, config, 0)
    expect(spread(track.slice(-60 * 200).map((state) => state.position.y))).toBeGreaterThan(0.01)
  })
})

describe('de vleugels aan en uit', () => {
  it('zet de vleugels aan het werk als hij vooruit moet', () => {
    /* Zonder slag gemeten, want dan komt hij niet vooruit en blijft de vraag om
       vooruit te komen staan. Zo isoleert dit het aan- en uitgaan zelf.
       In de scene loopt dat rond: geen slag betekent geen gemeten slagkracht,
       dus geen zet, dus blijft de vraag staan tot de vleugels op gang zijn. */
    expect(fly(4, VOOR, config, 0).state.beating).toBeGreaterThan(0.9)
  })

  it('laat ze los zodra hij achteruit zweeft', () => {
    /* hier zit het beeld dat we willen: open vleugels, geen slag */
    expect(fly(10, ACHTER).state.beating).toBeLessThan(0.05)
  })

  it('laat ze los als hij op zijn plek is', () => {
    /* aangekomen hoort hij de vleugels open te houden en te blijven hangen */
    expect(fly(20, VOOR).state.beating).toBeLessThan(0.05)
  })

  it('klappert niet rond het doel', () => {
    /* zonder de dode zone gaat het slaan bij aankomst aan en uit staan */
    const { track } = fly(40, VOOR)
    const laat = track.slice(-60 * 20).map((state) => state.beating)
    expect(Math.max(...laat)).toBeLessThan(0.2)
  })

  it('schakelt met vertraging en niet met een klap', () => {
    const { track } = fly(6, VOOR, config, 0)
    const stappen = track.slice(1).map((state, index) => state.beating - track[index].beating)
    expect(Math.max(...stappen.map(Math.abs))).toBeLessThan(0.05)
  })
})

describe('het lijf kantelen', () => {
  const heenEnWeer = (t: number): Vec2 => ({
    x: Math.floor(t / 4) % 2 === 0 ? -0.6 : 0.6,
    y: 0,
  })

  it('kantelt merkbaar mee', () => {
    expect(Math.max(...fly(60, heenEnWeer).track.map((s) => Math.abs(s.bank)))).toBeGreaterThan(10)
  })

  it('kantelt nooit verder dan de ingestelde hoek', () => {
    for (const state of fly(60, heenEnWeer).track) {
      expect(Math.abs(state.bank)).toBeLessThanOrEqual(config.bankAngle + 1e-6)
    }
  })

  it('kantelt naar de kant waar hij heen gaat', () => {
    /* naar rechts gaand hoort de neus ook naar rechts, en rechtsom is op het
       scherm de negatieve kant op */
    const { track } = fly(60, heenEnWeer)

    let agree = 0
    let counted = 0
    for (let index = 1; index < track.length; index++) {
      const sideways = track[index].position.x - track[index - 1].position.x
      if (Math.abs(sideways) < 1e-5 || Math.abs(track[index].bank) < 2) continue
      counted++
      if (Math.sign(track[index].bank) === -Math.sign(sideways)) agree++
    }

    expect(counted).toBeGreaterThan(500)
    expect(agree / counted).toBeGreaterThan(0.9)
  })

  it('richt zich weer op als hij stil hangt', () => {
    expect(fly(30, { x: 0, y: 0 }).state.bank).toBeCloseTo(0, 2)
  })

  it('kantelt niet als de knop op nul staat', () => {
    for (const state of fly(30, heenEnWeer, { ...config, bankAngle: 0 }).track) {
      expect(state.bank).toBeCloseTo(0, 9)
    }
  })

  it('houdt de ingestelde hoek als bovengrens, wat het volgtempo ook is', () => {
    const piek = (track: FlightState[]) => Math.max(...track.map((s) => Math.abs(s.bank)))

    for (const followRate of [0.4, 0.8, 1.5, 4, 8]) {
      const gemeten = piek(fly(60, heenEnWeer, { ...config, followRate }).track)
      expect(gemeten).toBeLessThanOrEqual(config.bankAngle + 1e-6)
      expect(gemeten).toBeGreaterThan(3)
    }
  })

  it('legt zich in dezelfde bocht als waar zijn neus heen draait', () => {
    /* twee gevolgen van één oorzaak, dus hetzelfde teken; gingen ze uit elkaar
       lopen dan zou hij schudden in plaats van draaien */
    const { track } = fly(60, heenEnWeer)

    let agree = 0
    let counted = 0
    for (const state of track) {
      if (Math.abs(state.bank) < 2 || Math.abs(state.roll) < 2) continue
      counted++
      if (Math.sign(state.roll) === Math.sign(state.bank)) agree++
    }

    expect(counted).toBeGreaterThan(500)
    expect(agree / counted).toBeGreaterThan(0.98)
  })

  it('rolt merkbaar, maar niet verder dan ingesteld', () => {
    const rolls = fly(60, heenEnWeer).track.map((s) => Math.abs(s.roll))

    expect(Math.max(...rolls)).toBeGreaterThan(8)
    expect(Math.max(...rolls)).toBeLessThanOrEqual(config.rollAngle + 1e-6)
  })

  it('gaat met rollen eerder om dan met draaien', () => {
    /* in de lucht leg je hem eerst en de bocht volgt; hier zit dat in het tempo,
       dus vroeg in een haal staat de rol verder op weg dan de kanteling */
    const { track } = fly(60, heenEnWeer)

    /* net na een omslag van richting, ruim vóór beide hun stand bereikt hebben */
    const state = track[Math.round(4 * 60) + 12]
    const rolled = Math.abs(state.roll) / config.rollAngle
    const banked = Math.abs(state.bank) / config.bankAngle

    expect(rolled).toBeGreaterThan(banked)
  })

  it('rolt niet als de knop op nul staat', () => {
    for (const state of fly(30, heenEnWeer, { ...config, rollAngle: 0 }).track) {
      expect(state.roll).toBeCloseTo(0, 9)
    }
  })

  it('kantelt minder naarmate hij de cursor sneller volgt', () => {
    /* Loopt tegen de intuïtie in en is toch het gewenste gedrag: sneller volgen
       geeft een hógere snelheidspiek maar een veel kortere, en het lijf heeft met
       bankRate 2,4 ruim vier tienden nodig om zijn stand te bereiken. Wie de
       draak aan zijn cursor plakt krijgt vanzelf een stijf lijf. */
    const piek = (track: FlightState[]) => Math.max(...track.map((s) => Math.abs(s.bank)))

    expect(piek(fly(60, heenEnWeer, { ...config, followRate: 4 }).track)).toBeLessThan(
      piek(fly(60, heenEnWeer, { ...config, followRate: 0.8 }).track),
    )
  })
})

describe('naar de kant van de cursor hangen', () => {
  /* buiten zijn bereik, zodat hij er niet naartoe kán en alleen dit overblijft */
  const VER_RECHTS: Vec2 = { x: 3, y: 0 }
  const VER_LINKS: Vec2 = { x: -3, y: 0 }

  it('blijft hangen als hij allang stilhangt', () => {
    const { state } = fly(30, VER_RECHTS)

    /* uitgevolgd en tot stilstand gekomen: de kanteling is weg, dit niet */
    expect(Math.abs(state.bank)).toBeLessThan(1)
    expect(Math.abs(state.lean)).toBeGreaterThan(config.leanAngle * 0.9)
  })

  it('hangt naar de kant waar de cursor staat', () => {
    /* rechts hoort naar rechts, en rechtsom is op het scherm de negatieve kant
       op, net als bij de kanteling */
    expect(Math.sign(fly(30, VER_RECHTS).state.lean)).toBe(-1)
    expect(Math.sign(fly(30, VER_LINKS).state.lean)).toBe(1)
  })

  it('blijft subtiel', () => {
    for (const state of fly(30, VER_RECHTS).track) {
      expect(Math.abs(state.lean)).toBeLessThanOrEqual(config.leanAngle + 1e-6)
    }
  })

  it('richt zich op als de cursor uit beeld is', () => {
    const rechts = fly(20, VER_RECHTS).state
    expect(Math.abs(rechts.lean)).toBeGreaterThan(1)

    /* en dan gaat de cursor weg: er is niets meer om naartoe te hangen */
    let state = rechts
    for (let frame = 0; frame < 20 * 60; frame++) {
      state = stepFlight(state, config, 1, null, reachOf(config), STEP)
    }
    expect(state.lean).toBeCloseTo(0, 2)
  })

  it('hangt niet als de knop op nul staat', () => {
    for (const state of fly(30, VER_RECHTS, { ...config, leanAngle: 0 }).track) {
      expect(state.lean).toBeCloseTo(0, 9)
    }
  })
})

describe('achteruit zweven heeft een aanzet en een uitloop', () => {
  /**
   * Dit was een vaste snelheid, en zo voelde het ook: opgemeten precies 0,500
   * eenheden per seconde, drieënhalve seconde lang, en dan pardoes stil. Een
   * verplaatsing die begint en eindigt op een muur leest als iets dat naar
   * achteren getrokken wordt, niet als een dier dat zich laat zakken.
   */
  const zakken = () => {
    /* eerst vooruit, dan het doel ver achter hem */
    let state = createFlightState(config)
    for (let frame = 0; frame < 60 * 12; frame++) {
      state = stepFlight(state, config, 1, { x: 0, y: -0.8 }, reachOf(config), STEP)
    }

    const snelheden: number[] = []
    for (let frame = 0; frame < 60 * 9; frame++) {
      const voor = state.position.y
      state = stepFlight(state, config, 1, { x: 0, y: 0.9 }, reachOf(config), STEP)
      snelheden.push((state.position.y - voor) / STEP)
    }
    return { state, snelheden }
  }

  it('zet aan in plaats van meteen op snelheid te staan', () => {
    const { snelheden } = zakken()
    const top = Math.max(...snelheden)

    expect(snelheden[0]).toBeLessThan(top * 0.15)
    expect(snelheden[Math.round(0.5 * 60)]).toBeGreaterThan(top * 0.5)
  })

  it('remt af bij aankomst in plaats van stil te vallen', () => {
    const { snelheden } = zakken()
    const top = Math.max(...snelheden)
    const opTop = snelheden.indexOf(top)

    /* na de kruissnelheid hoort er een aflopende staart te zitten, geen klif */
    const staart = snelheden.slice(opTop).filter((v) => v > top * 0.1 && v < top * 0.9)
    expect(staart.length).toBeGreaterThan(20)
  })

  it('komt niet boven het plafond uit', () => {
    /* de marge is het zweefwiebeltje: `driftAhead` ligt los over de plek heen,
       dus de gemeten snelheid bevat dat ook en de zweefsnelheid zelf niet */
    const wiebel = config.driftAhead * config.driftRate * 7
    for (const snelheid of zakken().snelheden) {
      expect(snelheid).toBeLessThanOrEqual(config.glideBack + wiebel)
    }
  })

  it('komt er wel aan', () => {
    /* Afgemeten tegen zijn bereik en niet tegen de cursor: het doel wordt daarop
       afgekapt, dus hij hoort dáár uit te komen en niet op de 0,9 die erin ging. */
    const doel = Math.min(0.9, reachOf(config).y)
    const { state } = zakken()

    expect(state.position.y).toBeGreaterThan(doel - config.driftAhead - 0.02)
  })

  it('gaat nooit de verkeerde kant op', () => {
    /* achteruit is zweven; een negatieve snelheid zou betekenen dat hij ineens
       vooruit gaat zonder ervoor te slaan */
    for (const snelheid of zakken().snelheden) {
      expect(snelheid).toBeGreaterThanOrEqual(-1e-6)
    }
  })
})
