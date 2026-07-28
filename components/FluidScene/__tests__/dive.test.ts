import { describe, expect, it } from 'vitest'
import { createDiveState, diveFoldsWings, diveHoldsControl, stepDive } from '../dive'
import type { DiveConfig } from '../types'

const config: DiveConfig = {
  diveEvery: 10,
  diveSpeed: 1.1,
  diveAcceleration: 9,
  diveDepth: 12,
  pitchRate: 3.5,
  fogDepth: 1.6,
  awayTime: 5,
  enterRate: 1.1,
  enterGap: 0.08,
}

const bounds = { x: 2, y: 1 }
const flying = { x: 0.3, y: -0.2 }

/** een stap van 1/60, met vaste willekeur zodat de uitkomst te controleren is */
const step = (state: ReturnType<typeof createDiveState>, over: Partial<Parameters<typeof stepDive>[2]> = {}) =>
  stepDive(state, config, {
    beatsAdvanced: 0,
    flying,
    bounds,
    delta: 1 / 60,
    random: () => 0.25,
    ...over,
  })

/** doorstappen tot de stand verandert, met een plafond zodat een test niet hangt */
const until = (
  start: ReturnType<typeof createDiveState>,
  stage: string,
  over: Partial<Parameters<typeof stepDive>[2]> = {},
) => {
  let state = start
  for (let frame = 0; frame < 4000 && state.stage !== stage; frame++) state = step(state, over)
  return state
}

describe('stepDive', () => {
  it('blijft vliegen zolang er nog niet genoeg slagen zijn', () => {
    let state = createDiveState()
    for (let beat = 0; beat < 9; beat++) state = step(state, { beatsAdvanced: 1 })

    expect(state.stage).toBe('flying')
    expect(state.beats).toBe(9)
  })

  it('duikt zodra het aantal slagen bereikt is', () => {
    let state = createDiveState()
    for (let beat = 0; beat < 10; beat++) state = step(state, { beatsAdvanced: 1 })

    expect(state.stage).toBe('diving')
    expect(state.beats).toBe(0)
  })

  it('begint de duik waar hij op dat moment vliegt', () => {
    let state = createDiveState()
    for (let beat = 0; beat < 10; beat++) state = step(state, { beatsAdvanced: 1 })

    expect(state.place).toEqual(flying)
  })

  it('duikt nooit als het op nul staat', () => {
    let state = createDiveState()
    const off = { ...config, diveEvery: 0 }
    for (let beat = 0; beat < 200; beat++) {
      state = stepDive(state, off, {
        beatsAdvanced: 1,
        flying,
        bounds,
        delta: 1 / 60,
        random: () => 0.25,
      })
    }

    expect(state.stage).toBe('flying')
  })

  it('duikt in een boog: eerst vooruit, dan de diepte in', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })

    let early = diving
    for (let frame = 0; frame < 5; frame++) early = step(early)
    let late = early
    for (let frame = 0; frame < 45; frame++) late = step(late)

    /* vooruit is een dalende y, en dat gebeurt vooral zolang hij nog vlak ligt */
    expect(early.place.y).toBeLessThan(diving.place.y)
    expect(late.depth).toBeLessThan(early.depth)

    /* de boog buigt om: het laatste stuk gaat veel meer de diepte in dan vooruit */
    const forwardLate = Math.abs(late.place.y - early.place.y)
    const downLate = Math.abs(late.depth - early.depth)
    expect(downLate).toBeGreaterThan(forwardLate)

    /* zijwaarts blijft hij waar hij was; dit is een duik en geen bocht */
    expect(late.place.x).toBe(diving.place.x)
  })

  it('brengt de neus omlaag voordat hij echt wegvalt', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })
    let state = diving
    for (let frame = 0; frame < 6; frame++) state = step(state)

    /* de kanteling loopt voor: al flink overgeheld terwijl hij nog nauwelijks weg is */
    expect(state.pitch).toBeLessThan(-10)
    expect(Math.abs(state.depth)).toBeLessThan(0.5)
    expect(state.pitch).toBeGreaterThan(-90)
  })

  it('valt steeds harder in plaats van op een vast tempo', () => {
    const state = until(createDiveState(), 'diving', { beatsAdvanced: 1 })

    let early = state
    for (let frame = 0; frame < 6; frame++) early = step(early)
    const earlyStep = early.depth - step(early).depth

    let later = early
    for (let frame = 0; frame < 20; frame++) later = step(later)
    const lastStep = later.depth - step(later).depth

    expect(lastStep).toBeGreaterThan(earlyStep)
  })

  it('gaat pas weg als hij ver genoeg van de camera is', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })
    const away = until(diving, 'away')

    expect(away.depth).toBeLessThan(-config.diveDepth)
  })

  it('blijft de ingestelde tijd weg', () => {
    const away = until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away')

    let state = away
    let seconds = 0
    while (state.stage === 'away' && seconds < 10) {
      state = step(state)
      seconds += 1 / 60
    }

    expect(seconds).toBeGreaterThanOrEqual(config.awayTime)
    expect(seconds).toBeLessThan(config.awayTime + 0.2)
  })

  it('komt van buiten beeld terug, aan de kant die de willekeur aanwijst', () => {
    const away = until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away')

    const left = until(away, 'entering', { random: () => 0.25 })
    const right = until(away, 'entering', { random: () => 0.75 })

    expect(left.side).toBe(-1)
    expect(right.side).toBe(1)
    expect(Math.abs(left.place.x)).toBeGreaterThan(bounds.x)
    expect(Math.abs(right.place.x)).toBeGreaterThan(bounds.x)
  })

  it('is al uit de mist voordat hij de helft van de oversteek heeft gedaan', () => {
    const entering = until(
      until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away'),
      'entering',
    )

    let state = entering
    const half = Math.abs(entering.place.x) / 2
    while (Math.abs(state.place.x) > half && state.stage === 'entering') state = step(state)

    /* zichtbaar betekent binnen de fog-diepte, anders vliegt hij als mist binnen */
    expect(Math.abs(state.depth)).toBeLessThan(config.fogDepth)
  })

  it('komt terug op een hoogte binnen beeld', () => {
    const entering = until(
      until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away'),
      'entering',
    )

    expect(Math.abs(entering.entry)).toBeLessThanOrEqual(bounds.y)
  })

  it('vliegt naar binnen en geeft de besturing daarna terug', () => {
    const entering = until(
      until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away'),
      'entering',
    )
    const back = until(entering, 'flying')

    expect(back.stage).toBe('flying')
    expect(Math.abs(back.place.x)).toBeLessThan(config.enterGap)
    expect(back.beats).toBe(0)
  })
})

describe('wie de besturing heeft', () => {
  it('laat de cursor met rust tijdens de hele manoeuvre', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })
    const away = until(diving, 'away')
    const entering = until(away, 'entering')

    expect(diveHoldsControl(createDiveState())).toBe(false)
    expect(diveHoldsControl(diving)).toBe(true)
    expect(diveHoldsControl(away)).toBe(true)
    expect(diveHoldsControl(entering)).toBe(true)
  })

  it('klapt de vleugels alleen in tijdens het vallen en niet bij het invliegen', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })
    const away = until(diving, 'away')
    const entering = until(away, 'entering')

    expect(diveFoldsWings(createDiveState())).toBe(false)
    expect(diveFoldsWings(diving)).toBe(true)
    expect(diveFoldsWings(away)).toBe(true)
    expect(diveFoldsWings(entering)).toBe(false)
  })
})
