import { describe, expect, it } from 'vitest'
import { createPointerState, eventToUv } from '../pointer'

const rect = { left: 100, top: 50, width: 800, height: 400 }

describe('eventToUv', () => {
  it('rekent naar de hoek van het element, niet naar die van het venster', () => {
    expect(eventToUv({ clientX: 100, clientY: 50 }, rect)).toEqual({ x: 0, y: 1 })
    expect(eventToUv({ clientX: 900, clientY: 450 }, rect)).toEqual({ x: 1, y: 0 })
  })

  it('legt het midden op 0,5', () => {
    expect(eventToUv({ clientX: 500, clientY: 250 }, rect)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('deelt niet door nul bij een element zonder afmetingen', () => {
    const uv = eventToUv({ clientX: 10, clientY: 10 }, { left: 0, top: 0, width: 0, height: 0 })

    expect(Number.isFinite(uv.x)).toBe(true)
    expect(Number.isFinite(uv.y)).toBe(true)
  })
})

describe('createPointerState', () => {
  it('begint zonder cursor en zonder klik', () => {
    const state = createPointerState()

    expect(state.uv).toBeNull()
    expect(state.clickedAt).toBeNull()
  })
})
