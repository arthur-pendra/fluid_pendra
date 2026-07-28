import { describe, expect, it } from 'vitest'
import { approach, lookYaw, neckWeights, tailAngle } from '../pose'
import type { PoseConfig } from '../types'

const config: PoseConfig = {
  tailSway: 0.03,
  tailRate: 1.1,
  tailWave: 3.2,
  neckFollow: 0.45,
  neckRate: 1.4,
}

/* het vlak waar het object op zweeft: x is rechts op het scherm, y is de z-as
   van de scene en loopt op het scherm dus andersom */
const SCREEN_UP = { x: 0, y: -1 }
const SCREEN_LEFT = { x: -1, y: 0 }
const SCREEN_RIGHT = { x: 1, y: 0 }

describe('tailAngle', () => {
  it('houdt de basis stil en laat de punt zwaaien', () => {
    /* een staart die aan zijn basis al uitslaat trekt aan de romp in plaats van
       eraan te hangen */
    let base = 0
    let tip = 0
    for (let frame = 0; frame < 600; frame++) {
      const time = frame / 60
      base = Math.max(base, Math.abs(tailAngle(0, time, config)))
      tip = Math.max(tip, Math.abs(tailAngle(1, time, config)))
    }

    expect(base).toBeCloseTo(0, 9)
    expect(tip).toBeGreaterThan(0)
  })

  it('slaat nooit verder uit dan de ingestelde zwaai', () => {
    for (let frame = 0; frame < 3600; frame++) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(Math.abs(tailAngle(t, frame / 60, config))).toBeLessThanOrEqual(config.tailSway)
      }
    }
  })

  it('laat de golf naar achteren reizen in plaats van als geheel uit te slaan', () => {
    /* met fase over de keten hoort de punt achter te lopen op het midden; zonder
       zou de hele staart tegelijk dezelfde kant op gaan */
    const time = 2
    const middle = tailAngle(0.5, time, config)
    const tip = tailAngle(1, time, config)

    expect(Math.sign(middle)).not.toBe(Math.sign(tip))
  })

  it('slaat als één stuk uit zodra de golf op nul staat', () => {
    const stiff = { ...config, tailWave: 0 }
    const time = 2

    expect(Math.sign(tailAngle(0.5, time, stiff))).toBe(Math.sign(tailAngle(1, time, stiff)))
  })

  it('herhaalt zichzelf niet op het tempo van de golf, want de adem loopt eroverheen', () => {
    /* een staart die precies op zijn eigen periode terugkomt is een metronoom,
       en dat is precies wat een vaste clip ook al is */
    const period = (2 * Math.PI) / config.tailRate
    const first = tailAngle(1, 4, config)
    const later = tailAngle(1, 4 + period, config)

    expect(Math.abs(later - first)).toBeGreaterThan(1e-4)
  })

  it('staat stil als de zwaai op nul staat', () => {
    expect(tailAngle(1, 3, { ...config, tailSway: 0 })).toBe(0)
  })
})

describe('neckWeights', () => {
  it('verdeelt precies de hele draai', () => {
    const shares = neckWeights(11)
    expect(shares.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 9)
  })

  it('laat de schakels bij de kop meer draaien dan die onderaan', () => {
    const shares = neckWeights(11)
    for (let index = 1; index < shares.length; index++) {
      expect(shares[index]).toBeGreaterThan(shares[index - 1])
    }
  })

  it('geeft niets terug voor een lege keten', () => {
    expect(neckWeights(0)).toEqual([])
  })
})

describe('lookYaw', () => {
  it('draait niet als het doel recht vooruit ligt', () => {
    expect(lookYaw(SCREEN_UP, SCREEN_UP, 1)).toBeCloseTo(0, 9)
  })

  it('draait tegen de klok in voor een doel links op het scherm', () => {
    /* een draai om de wereld-op telt op het scherm tegen de klok in, en links
       ligt tegen de klok in vanaf recht vooruit */
    expect(lookYaw(SCREEN_UP, SCREEN_LEFT, 2)).toBeCloseTo(Math.PI / 2, 6)
  })

  it('draait met de klok mee voor een doel rechts op het scherm', () => {
    expect(lookYaw(SCREEN_UP, SCREEN_RIGHT, 2)).toBeCloseTo(-Math.PI / 2, 6)
  })

  it('knipt op de grens in plaats van door te draaien', () => {
    /* zonder grens kijkt de draak over zijn eigen rug heen */
    expect(lookYaw(SCREEN_UP, SCREEN_LEFT, 0.45)).toBeCloseTo(0.45, 9)
    expect(lookYaw(SCREEN_UP, SCREEN_RIGHT, 0.45)).toBeCloseTo(-0.45, 9)
  })

  it('draait niet naar een doel dat samenvalt met de kop', () => {
    expect(lookYaw(SCREEN_UP, { x: 0, y: 0 }, 1)).toBe(0)
  })
})

describe('approach', () => {
  it('komt dichterbij zonder eroverheen te schieten', () => {
    let value = 0
    for (let frame = 0; frame < 600; frame++) {
      value = approach(value, 1, 1.4, 1 / 60)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(value).toBeCloseTo(1, 3)
  })

  it('hangt aan de tijd en niet aan de framerate', () => {
    let fast = 0
    for (let frame = 0; frame < 120; frame++) fast = approach(fast, 1, 1.4, 1 / 120)

    let slow = 0
    for (let frame = 0; frame < 30; frame++) slow = approach(slow, 1, 1.4, 1 / 30)

    expect(fast).toBeCloseTo(slow, 6)
  })

  it('blijft staan als het doel al bereikt is', () => {
    expect(approach(0.45, 0.45, 1.4, 1 / 60)).toBeCloseTo(0.45, 9)
  })
})
