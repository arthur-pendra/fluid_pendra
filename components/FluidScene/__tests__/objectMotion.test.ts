import { describe, expect, it } from 'vitest'
import { createMotionState, stepMotion, stirPoints } from '../objectMotion'

const config = { followSpeed: 1, driftRadius: 0, driftSpeed: 0 }

const distanceTo = (state: ReturnType<typeof createMotionState>, x: number, y: number) =>
  Math.hypot(state.position.x - x, state.position.y - y)

describe('stepMotion', () => {
  it('kruipt naar het doel toe en komt er uiteindelijk aan', () => {
    let state = createMotionState({ x: 0, y: 0 })
    state.target = { x: 2, y: 0 }

    const start = distanceTo(state, 2, 0)
    for (let frame = 0; frame < 200; frame++) {
      state = stepMotion(state, config, 1 / 60)
    }

    expect(distanceTo(state, 2, 0)).toBeLessThan(start)
    expect(distanceTo(state, 2, 0)).toBeCloseTo(0, 5)
  })

  it('houdt zich aan het snelheidsplafond', () => {
    let state = createMotionState({ x: 0, y: 0 })
    state.target = { x: 100, y: 0 }

    state = stepMotion(state, config, 0.5)

    expect(state.position.x).toBeCloseTo(0.5, 6)
  })

  it('schiet niet voorbij het doel', () => {
    let state = createMotionState({ x: 0, y: 0 })
    state.target = { x: 0.1, y: 0 }

    state = stepMotion(state, config, 1)

    expect(state.position.x).toBeCloseTo(0.1, 6)
  })

  it('blijft bewegen als het doel bereikt is, anders verdwijnt het object', () => {
    let state = createMotionState({ x: 0, y: 0 })
    state.target = { x: 0, y: 0 }

    state = stepMotion(state, { ...config, driftRadius: 0.3, driftSpeed: 1 }, 0.5)
    const first = { ...state.visible }
    state = stepMotion(state, { ...config, driftRadius: 0.3, driftSpeed: 1 }, 0.5)

    expect(Math.hypot(state.visible.x - first.x, state.visible.y - first.y)).toBeGreaterThan(0)
  })
})

describe('stirPoints', () => {
  it('levert het gevraagde aantal punten', () => {
    const state = createMotionState({ x: 0, y: 0 })
    expect(stirPoints(state, 7, 1)).toHaveLength(7)
  })

  it('spant precies de lengte van het object op, want dat bepaalt de veeg', () => {
    const state = createMotionState({ x: 0, y: 0 })
    const points = stirPoints(state, 7, 1.5)
    const first = points[0]
    const last = points[points.length - 1]

    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeCloseTo(1.5, 6)
  })

  it('centreert de lijn op de zichtbare positie', () => {
    let state = createMotionState({ x: 1, y: 2 })
    state = stepMotion(state, config, 1 / 60)
    const points = stirPoints(state, 3, 1)
    const middle = points[1]

    expect(middle.x).toBeCloseTo(state.visible.x, 6)
    expect(middle.y).toBeCloseTo(state.visible.y, 6)
  })
})
