import { describe, expect, it } from 'vitest'
import { createThrustState, stepThrust, type ThrustState } from '../thrust'
import type { ThrustConfig } from '../types'

const config: ThrustConfig = {
  thrustResponse: 6,
  thrustAdapt: 0.3,
  glideHold: 0.9,
  soarBrake: 0.22,
}

const STEP = 1 / 60

/** een aantal frames doorrekenen met een vaste slagkracht */
const run = (state: ThrustState, push: number, frames: number, over = config) => {
  let current = state
  for (let frame = 0; frame < frames; frame++) {
    current = stepThrust(current, push, over, STEP)
  }
  return current
}

/**
 * Een hele vleugelslag zoals de meting hem oplevert: een halve sinus tijdens de
 * neerslag, niets tijdens de terugslag. Geeft het signaal per frame terug, zodat
 * een test kan kijken hoe het door de slag heen loopt.
 */
const beats = (peak: number, count: number, hz: number, over = config) => {
  let state = createThrustState()
  const track: number[] = []
  const frames = Math.round(count / hz / STEP)

  for (let frame = 0; frame < frames; frame++) {
    const phase = ((frame * STEP * hz) % 1)
    const push = phase < 0.5 ? Math.sin(phase * 2 * Math.PI) * peak : 0
    state = stepThrust(state, push, over, STEP)
    track.push(state.boost)
  }

  return { state, track }
}

/** de laatste twee slagen, als die op gang zijn */
const settled = (track: number[], count: number, hz: number) =>
  track.slice(Math.round((count - 2) / hz / STEP))

describe('stepThrust', () => {
  it('begint stil', () => {
    expect(createThrustState().boost).toBe(0)
  })

  it('blijft stil zolang er niet geslagen wordt', () => {
    expect(run(createThrustState(), 0, 240).boost).toBeCloseTo(0, 9)
  })

  it('loopt op zodra hij slaat', () => {
    expect(run(createThrustState(), 0.4, 20).boost).toBeGreaterThan(0)
  })

  it('zakt weer in als de slag stopt', () => {
    const beaten = run(createThrustState(), 0.4, 20)
    const stopped = run(beaten, 0, 120)

    expect(stopped.boost).toBeLessThan(beaten.boost * 0.05)
  })

  it('beweegt zichtbaar mee met elke slag in plaats van vooruit te gaan staan', () => {
    /* dit is de hele reden dat hier geen veer met massa staat. Die dempte de
       losse slagen weg tot een constante verschuiving: 0,3% beeldhoogte wiebel
       op 4% uitslag. Het signaal moet over de slag heen minstens de helft van
       zijn eigen bereik aflopen, anders krijgt de draak een constante extra
       snelheid in plaats van een duw per slag. */
    const { track } = beats(0.3, 8, 1.4)
    const last = settled(track, 8, 1.4)
    const swing = Math.max(...last) - Math.min(...last)

    expect(swing).toBeGreaterThan(Math.max(...last) * 0.5)
  })

  it('blijft dat doen bij een ander slagtempo', () => {
    /* frequentie-onafhankelijk: de slagfrequentie staat in de clip en nergens
       in de code, dus geen enkel tempo mag het effect wegdempen */
    for (const hz of [0.6, 1.4, 3]) {
      const { track } = beats(0.3, 10, hz)
      const last = settled(track, 10, hz)
      const swing = Math.max(...last) - Math.min(...last)

      expect(swing).toBeGreaterThan(Math.max(...last) * 0.5)
    }
  })

  it('loopt achter op de slag, want de draak heeft gewicht', () => {
    /* de piek hoort ná de piek van de slag te komen; valt hij samen, dan is het
       signaal een kopie van de slag en oogt het mechanisch */
    const hz = 1.4
    const { track } = beats(0.3, 8, hz)
    const last = settled(track, 8, hz)

    const peakAt = last.indexOf(Math.max(...last))
    const strokePeakAt = Math.round(0.25 / hz / STEP)

    expect(peakAt).toBeGreaterThan(strokePeakAt)
  })

  it('blijft tussen nul en een, hoe hard er ook geslagen wordt', () => {
    const { state } = beats(1000, 20, 1.4)

    expect(state.boost).toBeLessThanOrEqual(1 + 1e-9)
    expect(state.boost).toBeGreaterThanOrEqual(0)
  })

  it('meet de slag af tegen zijn eigen piek, zodat de knop niet aan het model hangt', () => {
    /* dezelfde slag, tien keer zo hard gemeten: een model dat groter in beeld
       staat of meer roerpunten heeft hoort niet ineens harder te versnellen */
    const zacht = beats(0.05, 12, 1.4).state
    const hard = beats(0.5, 12, 1.4).state

    expect(hard.boost).toBeCloseTo(zacht.boost, 4)
  })

  it('houdt de gemeten piek bij en laat hem langzaam zakken', () => {
    const beaten = run(createThrustState(), 0.4, 20)
    expect(beaten.peak).toBeCloseTo(0.4, 6)

    /* een seconde zonder slag zakt de piek met thrustAdapt, niet naar nul */
    expect(run(beaten, 0, 60).peak).toBeCloseTo(0.4 * Math.exp(-config.thrustAdapt), 3)
  })

  it('maakt geen sprong bij een grote delta, zoals na een verborgen tab', () => {
    const jump = stepThrust(createThrustState(), 0.5, config, 1 / 30)
    const twice = run(createThrustState(), 0.5, 2)

    expect(jump.boost).toBeCloseTo(twice.boost, 4)
    expect(jump.boost).toBeLessThanOrEqual(1)
  })
})
