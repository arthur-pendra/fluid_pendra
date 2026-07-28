import { describe, expect, it } from 'vitest'
import { pickStirPoints } from '../stirSurface'
import type { PointMotion } from '../types'

const point = (x: number, amplitude: number): PointMotion => ({
  center: { x, y: 0, z: 0 },
  amplitude,
})

describe('pickStirPoints', () => {
  it('geeft niets terug als er geen punten zijn', () => {
    expect(pickStirPoints([], 4)).toEqual([])
  })

  it('geeft niets terug als niets beweegt', () => {
    expect(pickStirPoints([point(0, 0), point(1, 0)], 4)).toEqual([])
  })

  it('vraagt om nul punten en krijgt er nul', () => {
    expect(pickStirPoints([point(0, 1)], 0)).toEqual([])
  })

  it('begint bij het punt dat het hardst beweegt', () => {
    expect(pickStirPoints([point(0, 0.2), point(1, 1), point(2, 0.5)], 1)).toEqual([1])
  })

  it('kiest liever een punt verderop dan zijn buurman', () => {
    /* twee plekken op dezelfde vleugelpunt die even hard bewegen, plus een staart
       die iets minder beweegt maar aan de andere kant zit */
    const points = [point(0, 1), point(0.01, 0.99), point(10, 0.6)]
    expect(pickStirPoints(points, 2)).toEqual([0, 2])
  })

  it('laat punten die nauwelijks bewegen buiten de selectie', () => {
    expect(pickStirPoints([point(0, 1), point(5, 0.01)], 4)).toEqual([0])
  })

  it('geeft nooit hetzelfde punt twee keer', () => {
    const points = Array.from({ length: 12 }, (_, index) => point(index, 1 - index * 0.05))
    const picked = pickStirPoints(points, 7)

    expect(picked).toHaveLength(7)
    expect(new Set(picked).size).toBe(7)
  })

  it('geeft liever te weinig punten dan punten op dezelfde plek', () => {
    expect(pickStirPoints([point(0, 1), point(4, 0.8)], 7)).toHaveLength(2)
  })

  it('spreidt over het model in plaats van alles in dezelfde vleugel te zetten', () => {
    /* een cluster van vijf bij x = 0 en een enkel punt bij x = 20; met twee
       roerpunten hoort er precies een uit elk gebied te komen */
    const points = [
      ...Array.from({ length: 5 }, (_, index) => point(index * 0.1, 1)),
      point(20, 0.9),
    ]
    const picked = pickStirPoints(points, 2)

    expect(picked).toContain(5)
    expect(picked.filter((index) => index < 5)).toHaveLength(1)
  })
})
