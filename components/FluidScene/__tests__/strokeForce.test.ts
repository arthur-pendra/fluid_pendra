import { describe, expect, it } from 'vitest'
import { strokeForce, windVector } from '../strokeForce'
import type { Vec2 } from '../types'

/* de wind waait naar beneden op het scherm, wat in de buffer +y is */
const DOWN: Vec2 = { x: 0, y: 1 }

const length = (v: Vec2) => Math.sqrt(v.x * v.x + v.y * v.y)

describe('windVector', () => {
  it('geeft een eenheidsvector', () => {
    for (const degrees of [0, 45, 90, 200, 270, 359]) {
      expect(length(windVector(degrees, 1.7))).toBeCloseTo(1, 6)
    }
  })

  it('klapt de y-as om, net als de plekken die het vergelijkt', () => {
    /* 90 graden is op het scherm omhoog, en de buffer telt andersom */
    const up = windVector(90, 1)
    expect(up.x).toBeCloseTo(0, 6)
    expect(up.y).toBeCloseTo(-1, 6)

    const down = windVector(270, 1)
    expect(down.x).toBeCloseTo(0, 6)
    expect(down.y).toBeCloseTo(1, 6)
  })

  it('perst een schuine as mee met het scherm, anders wijst hij de verkeerde kant op', () => {
    /* 45 graden op een scherm dat twee keer zo breed is als hoog: de y-component
       wordt gehalveerd, dus de as ligt platter dan de helft */
    const wind = windVector(45, 2)
    expect(Math.abs(wind.y / wind.x)).toBeCloseTo(0.5, 6)
  })
})

describe('strokeForce', () => {
  it('laat een stilstaand punt met rust', () => {
    expect(strokeForce({ x: 0, y: 0 }, DOWN, 0.75, 0.35)).toEqual({ x: 0, y: 0 })
  })

  it('verandert niets als beide knoppen op nul staan', () => {
    const force = { x: 0.3, y: -0.4 }
    const shaped = strokeForce(force, DOWN, 0, 0)

    expect(shaped.x).toBeCloseTo(force.x, 6)
    expect(shaped.y).toBeCloseTo(force.y, 6)
  })

  it('laat de slag met de wind mee op volle sterkte door', () => {
    const shaped = strokeForce({ x: 0, y: 0.02 }, DOWN, 1, 1)

    expect(shaped.x).toBeCloseTo(0, 6)
    expect(shaped.y).toBeCloseTo(0.02, 6)
  })

  it('haalt de slag tegen de wind in helemaal weg op bias 1', () => {
    const shaped = strokeForce({ x: 0, y: -0.02 }, DOWN, 1, 1)

    expect(length(shaped)).toBeCloseTo(0, 6)
  })

  it('dempt de slag tegenin zonder hem om te draaien', () => {
    const shaped = strokeForce({ x: 0, y: -0.02 }, DOWN, 0.75, 0)

    /* nog steeds omhoog, alleen zwak: een vleugel die terugkomt duwt niet
       ineens de andere kant op */
    expect(shaped.y).toBeLessThan(0)
    expect(length(shaped)).toBeCloseTo(0.02 * 0.25, 6)
  })

  it('duwt de slag mee harder dan de slag terug', () => {
    const forward = strokeForce({ x: 0, y: 0.02 }, DOWN, 0.75, 0.35)
    const back = strokeForce({ x: 0, y: -0.02 }, DOWN, 0.75, 0.35)

    expect(length(forward)).toBeGreaterThan(length(back))
  })

  it('laat de slag terug al glijden zodra hij bovenwinds gaat, niet pas recht tegenin', () => {
    /* dit is waar het rommelig van werd: liep de demping over de hele halve
       cirkel, dan bleef een schuine terugslag flink duwen en botste die op het
       spoor van de vorige neerslag */
    const shallow = strokeForce({ x: 0.02, y: -0.008 }, DOWN, 1, 0)

    expect(length(shallow)).toBeLessThan(0.02 * 0.05)
  })

  it('houdt de slag mee op volle sterkte tot vlak bij dwars', () => {
    const shallow = strokeForce({ x: 0.02, y: 0.008 }, DOWN, 1, 0)
    const raw = { x: 0.02, y: 0.008 }

    expect(length(shallow)).toBeCloseTo(length(raw), 6)
  })

  it('zet een dwarse slag halverwege', () => {
    const shaped = strokeForce({ x: 0.02, y: 0 }, DOWN, 0.8, 0)

    expect(length(shaped)).toBeCloseTo(0.02 * 0.6, 6)
  })

  it('kamt de dwarsbeweging weg en laat het deel langs de as staan', () => {
    /* schuin naar beneden: de component langs de as hoort onaangeroerd te
       blijven, alleen wat er opzij gebeurt wordt gehalveerd */
    const shaped = strokeForce({ x: 0.02, y: 0.02 }, DOWN, 0, 0.5)

    expect(shaped.y).toBeCloseTo(0.02, 6)
    expect(shaped.x).toBeCloseTo(0.01, 6)
  })

  it('legt de slag volledig op de as als de kam helemaal dicht staat', () => {
    const shaped = strokeForce({ x: 0.02, y: 0.02 }, DOWN, 0, 1)

    expect(shaped.x).toBeCloseTo(0, 6)
    expect(shaped.y).toBeCloseTo(0.02, 6)
  })

  it('kamt ook de dwarsbeweging van de slag terug weg', () => {
    /* een vleugel die zich invouwt doet ook opzij nauwelijks werk; liet je dat
       staan, dan bleef de terugslag alsnog naar opzij spatten */
    const shaped = strokeForce({ x: 0.02, y: -0.02 }, DOWN, 0, 1)

    expect(shaped.x).toBeCloseTo(0, 6)
    expect(shaped.y).toBeCloseTo(-0.02, 6)
  })

  it('houdt de lengte binnen wat er in ging', () => {
    const force = { x: 0.03, y: 0.01 }
    for (const bias of [0, 0.5, 1]) {
      for (const steering of [0, 0.5, 1]) {
        expect(length(strokeForce(force, DOWN, bias, steering))).toBeLessThanOrEqual(
          length(force) + 1e-9,
        )
      }
    }
  })
})
