import { describe, expect, it } from 'vitest'
import { BASE_HEADING, createFlightState, noise, stepFlight, wrapAngle, type FlightState } from '../flight'
import type { FlightConfig } from '../types'

const config: FlightConfig = {
  driftSide: 0.3,
  driftAhead: 0.14,
  driftRate: 0.09,
  beatSurge: 0.12,
  bankAngle: 12,
  bankRate: 1.6,
}

const STEP = 1 / 60

const fly = (seconds: number, over = config, boost: number | ((t: number) => number) = 0) => {
  let state = createFlightState(over)
  const track: FlightState[] = []
  for (let frame = 0; frame < seconds * 60; frame++) {
    const push = typeof boost === 'function' ? boost(frame * STEP) : boost
    state = stepFlight(state, over, push, STEP)
    track.push(state)
  }
  return { state, track }
}

const spread = (values: number[]) => Math.max(...values) - Math.min(...values)

describe('wrapAngle', () => {
  it('legt elke hoek op -180 tot 180', () => {
    expect(wrapAngle(0)).toBe(0)
    expect(wrapAngle(190)).toBeCloseTo(-170, 9)
    expect(wrapAngle(-190)).toBeCloseTo(170, 9)
    expect(wrapAngle(720 + 45)).toBeCloseTo(45, 9)
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
    /* een lissajous zou dat wel doen, en dan zie je het patroon terugkomen —
       precies wat een vaste clip ook al doet */
    const first = Array.from({ length: 50 }, (_, index) => noise(index * 0.1))
    const later = Array.from({ length: 50 }, (_, index) => noise(500 + index * 0.1))
    const difference = first.reduce((sum, value, index) => sum + Math.abs(value - later[index]), 0)

    expect(difference).toBeGreaterThan(1)
  })
})

describe('stepFlight', () => {
  it('blijft binnen de ingestelde uitwijking', () => {
    /* per constructie, niet bij benadering: de plek is de ruis maal de straal,
       dus er is geen afstelling waarmee hij het beeld uit kan zweven */
    const { track } = fly(600)

    for (const state of track) {
      expect(Math.abs(state.position.x)).toBeLessThanOrEqual(config.driftSide + 1e-9)
      expect(Math.abs(state.position.y)).toBeLessThanOrEqual(config.driftAhead + 1e-9)
    }
  })

  it('zweeft zijwaarts verder dan naar voren en achteren', () => {
    /* dat is het zweven zelf; andersom wordt het dobberen */
    const { track } = fly(600)

    expect(spread(track.map((state) => state.position.x))).toBeGreaterThan(
      spread(track.map((state) => state.position.y)),
    )
  })

  it('gebruikt de hele uitwijking en blijft niet in het midden hangen', () => {
    const { track } = fly(600)
    expect(spread(track.map((state) => state.position.x))).toBeGreaterThan(config.driftSide)
  })

  it('laat de twee assen niet samen lopen', () => {
    /* delen ze hun ruis, dan zwabbert hij over één diagonaal heen en weer in
       plaats van te zweven */
    const { track } = fly(600)
    const xs = track.map((state) => state.position.x)
    const ys = track.map((state) => state.position.y)

    const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length
    const mx = mean(xs)
    const my = mean(ys)
    const covariance = mean(xs.map((x, index) => (x - mx) * (ys[index] - my)))
    const deviation = (values: number[], m: number) =>
      Math.sqrt(mean(values.map((v) => (v - m) * (v - m))))

    const correlation = covariance / (deviation(xs, mx) * deviation(ys, my))
    expect(Math.abs(correlation)).toBeLessThan(0.5)
  })

  it('kantelt mee met het zijwaarts zweven', () => {
    const { track } = fly(600)
    const banked = track.filter((state) => Math.abs(state.bank) > 1)

    expect(banked.length).toBeGreaterThan(0)
    for (const state of track) {
      expect(Math.abs(state.bank)).toBeLessThanOrEqual(config.bankAngle + 1e-6)
    }
  })

  it('kantelt naar de kant waar hij heen zweeft', () => {
    /* naar rechts zwevend hoort de neus ook naar rechts, en rechtsom is op het
       scherm de negatieve kant op. Met vertraging gemeten, want de kanteling
       loopt achter op de beweging. */
    const { track } = fly(600)

    let agree = 0
    let counted = 0
    for (let index = 30; index < track.length; index++) {
      const sideways = track[index].position.x - track[index - 1].position.x
      if (Math.abs(sideways) < 1e-6) continue
      const bank = track[index].bank
      if (Math.abs(bank) < 1) continue
      counted++
      if (Math.sign(bank) === -Math.sign(sideways)) agree++
    }

    expect(counted).toBeGreaterThan(1000)
    expect(agree / counted).toBeGreaterThan(0.9)
  })

  it('kantelt niet als de knop op nul staat', () => {
    const { track } = fly(120, { ...config, bankAngle: 0 })
    for (const state of track) expect(state.bank).toBeCloseTo(0, 9)
  })

  it('houdt de kanteling in graden, ook bij een andere driftstraal', () => {
    /* zonder de normalisatie op de steilste ruishelling zou bankAngle
       meebewegen met driftSide en driftRate, en dan moet je hem elke keer
       opnieuw zoeken */
    const smal = fly(600, { ...config, driftSide: 0.1 }).track
    const ruim = fly(600, { ...config, driftSide: 0.6 }).track

    const piek = (track: FlightState[]) => Math.max(...track.map((s) => Math.abs(s.bank)))
    expect(piek(ruim)).toBeCloseTo(piek(smal), 1)
  })

  it('zet hem naar voren op de slag', () => {
    /* naar voren is op het scherm omhoog, en `y` is de z-as die daar andersom
       loopt, dus de zet gaat er met een minteken af */
    const rustig = fly(60, config, 0).track
    const slaand = fly(60, config, 1).track

    const gemiddelde = (track: FlightState[]) =>
      track.reduce((sum, state) => sum + state.position.y, 0) / track.length

    expect(gemiddelde(rustig) - gemiddelde(slaand)).toBeCloseTo(config.beatSurge, 6)
  })

  it('laat de zet weer los tussen de slagen door', () => {
    /* een slag die één keer per drie seconden komt, zoals de clip hem heeft */
    const { track } = fly(60, config, (t) => (t % 3.3 < 0.6 ? 1 : 0))
    const late = track.slice(-60 * 30)

    const surge = late.map((state) => state.position.y)
    expect(spread(surge)).toBeGreaterThan(config.beatSurge * 0.8)
  })

  it('staat stil als alles op nul staat', () => {
    const still = { ...config, driftSide: 0, driftAhead: 0, beatSurge: 0 }
    const { state } = fly(60, still, 1)

    expect(state.position.x).toBeCloseTo(0, 9)
    expect(state.position.y).toBeCloseTo(0, 9)
  })

  it('houdt de kop op de vaste koers', () => {
    /* alleen de kanteling komt erbij; hij mag niet gaan ronddraaien */
    const { track } = fly(600)
    for (const state of track) {
      expect(Math.abs(wrapAngle(BASE_HEADING + state.bank - BASE_HEADING))).toBeLessThanOrEqual(
        config.bankAngle + 1e-6,
      )
    }
  })
})
