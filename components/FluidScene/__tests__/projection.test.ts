import { describe, expect, it } from 'vitest'
import {
  distanceForHeight,
  ndcToUv,
  planeDirection,
  planeHalfSize,
  screenToSimulationDirection,
  screenToSimulationUv,
  uvToPlane,
} from '../projection'

describe('screenToSimulationUv', () => {
  it('houdt het midden op het midden', () => {
    const uv = screenToSimulationUv({ x: 0.5, y: 0.5 }, 2)
    expect(uv.x).toBeCloseTo(0.5, 6)
    expect(uv.y).toBeCloseTo(0.5, 6)
  })

  it('perst de y-as samen op een breed scherm, want de buffer is vierkant', () => {
    const uv = screenToSimulationUv({ x: 0.5, y: 1 }, 2)
    expect(uv.y).toBeCloseTo(0.25, 6)
  })

  it('perst de x-as samen op een hoog scherm', () => {
    const uv = screenToSimulationUv({ x: 1, y: 0.5 }, 0.5)
    expect(uv.x).toBeCloseTo(0.75, 6)
  })

  it('klapt de y-as om, want de buffer telt andersom', () => {
    expect(screenToSimulationUv({ x: 0.5, y: 1 }, 1).y).toBeCloseTo(0, 6)
    expect(screenToSimulationUv({ x: 0.5, y: 0 }, 1).y).toBeCloseTo(1, 6)
  })
})

describe('screenToSimulationDirection', () => {
  it('loopt gelijk met het verschil tussen twee plekken', () => {
    /* dit is de hele reden dat de functie bestaat: een richting hoort dezelfde
       kant op te wijzen als het spoor dat de plekken erlangs trekken */
    const ratio = 1.7
    const from = { x: 0.3, y: 0.4 }
    const to = { x: 0.55, y: 0.9 }

    const a = screenToSimulationUv(from, ratio)
    const b = screenToSimulationUv(to, ratio)
    const direction = screenToSimulationDirection({ x: to.x - from.x, y: to.y - from.y }, ratio)

    expect(direction.x).toBeCloseTo(b.x - a.x, 6)
    expect(direction.y).toBeCloseTo(b.y - a.y, 6)
  })

  it('klapt de y-as om en laat het midden buiten beschouwing', () => {
    expect(screenToSimulationDirection({ x: 1, y: 1 }, 1)).toEqual({ x: 1, y: -1 })
  })
})

describe('ndcToUv', () => {
  it('legt het clipgebied op nul tot een', () => {
    expect(ndcToUv(-1, -1)).toEqual({ x: 0, y: 0 })
    expect(ndcToUv(0, 0)).toEqual({ x: 0.5, y: 0.5 })
    expect(ndcToUv(1, 1)).toEqual({ x: 1, y: 1 })
  })
})

describe('planeHalfSize', () => {
  it('geeft een halve hoogte van 1 op de afstand die daarvoor nodig is', () => {
    const distance = distanceForHeight(45, 2)
    const { halfWidth, halfHeight } = planeHalfSize(45, distance, 2)

    expect(halfHeight).toBeCloseTo(1, 6)
    expect(halfWidth).toBeCloseTo(2, 6)
  })
})

describe('planeDirection', () => {
  it('legt rechts op het scherm op de x-as', () => {
    const right = planeDirection(0)
    expect(right.x).toBeCloseTo(1, 6)
    expect(right.y).toBeCloseTo(0, 6)
  })

  it('legt omhoog op het scherm op -z, want daar kijkt de camera langs', () => {
    const up = planeDirection(90)
    expect(up.x).toBeCloseTo(0, 6)
    expect(up.y).toBeCloseTo(-1, 6)
  })

  it('loopt gelijk met uvToPlane, anders wijst de draak de verkeerde kant op', () => {
    /* een stap naar boven op het scherm hoort in beide dezelfde kant op te gaan */
    const centre = uvToPlane({ x: 0.5, y: 0.5 }, 1, 1)
    const higher = uvToPlane({ x: 0.5, y: 0.6 }, 1, 1)
    const up = planeDirection(90)

    expect(Math.sign(higher.y - centre.y)).toBe(Math.sign(up.y))
  })
})

describe('uvToPlane', () => {
  it('zet het midden van het scherm op de oorsprong', () => {
    expect(uvToPlane({ x: 0.5, y: 0.5 }, 2, 1)).toEqual({ x: 0, y: -0 })
  })

  it('klapt de y-as om, want in uv wijst die omhoog en in de scene naar -z', () => {
    expect(uvToPlane({ x: 1, y: 1 }, 2, 1)).toEqual({ x: 2, y: -1 })
    expect(uvToPlane({ x: 0, y: 0 }, 2, 1)).toEqual({ x: -2, y: 1 })
  })
})
