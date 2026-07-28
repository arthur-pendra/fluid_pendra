import { describe, expect, it } from 'vitest'
import { createFlightState, noise, stepFlight, wrapAngle, type FlightState } from '../flight'
import type { FlightConfig, Vec2 } from '../types'

const config: FlightConfig = {
  reachSide: 0.65,
  reachAhead: 0.6,
  followRate: 1.5,
  beatThrust: 1.1,
  glideBack: 0.22,
  arriveGap: 0.04,
  beatRate: 2.5,
  driftAhead: 0.05,
  driftRate: 0.09,
  bankAngle: 25,
  bankRate: 2.4,
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
