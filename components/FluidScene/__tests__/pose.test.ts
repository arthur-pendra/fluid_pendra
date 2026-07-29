import { describe, expect, it } from 'vitest'
import { approach, bearing, gazeYaw, lookHold, lookYaw, neckWeights, soarAngle, tailAngle } from '../pose'
import type { PoseConfig } from '../types'

const config: PoseConfig = {
  tailSway: 0.03,
  tailRate: 1.1,
  tailWave: 3.2,
  neckFollow: 0.45,
  neckRate: 1.4,
  lookGive: 2,
  gazeSweep: 0.16,
  gazeRate: 0.13,
  soarLift: 0.09,
  soarRate: 0.35,
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

describe('soarAngle', () => {
  const sample = (t: number, seed: number) =>
    Array.from({ length: 2400 }, (_, frame) => soarAngle(t, frame / 60, seed, config))

  it('beweegt, want een stilstaande vleugel ziet er dood uit', () => {
    const bereik = sample(0, 0)
    expect(Math.max(...bereik) - Math.min(...bereik)).toBeGreaterThan(config.soarLift * 0.5)
  })

  it('blijft binnen de ingestelde uitslag', () => {
    for (const t of [0, 0.5, 1]) {
      for (const angle of sample(t, 0)) {
        expect(Math.abs(angle)).toBeLessThanOrEqual(config.soarLift + 1e-9)
      }
    }
  })

  it('laat de schouder meer doen dan de punt', () => {
    /* een vleugel draagt bij de schouder; andersom lijkt het of alleen het
       puntje trilt */
    const schouder = sample(0, 0)
    const punt = sample(1, 0)
    const bereik = (values: number[]) => Math.max(...values) - Math.min(...values)

    expect(bereik(schouder)).toBeGreaterThan(bereik(punt))
  })

  it('laat links en rechts nooit gelijk lopen', () => {
    /* symmetrie is precies wat het levenloos maakt */
    const links = sample(0, 0)
    const rechts = sample(0, 31.7)
    const verschil = links.reduce((sum, value, index) => sum + Math.abs(value - rechts[index]), 0)

    expect(verschil / links.length).toBeGreaterThan(config.soarLift * 0.2)
  })

  it('loopt vloeiend, zonder sprongen tussen twee frames', () => {
    const track = sample(0.5, 0)
    let biggest = 0
    for (let index = 1; index < track.length; index++) {
      biggest = Math.max(biggest, Math.abs(track[index] - track[index - 1]))
    }
    expect(biggest).toBeLessThan(config.soarLift * 0.05)
  })

  it('staat stil als de knop op nul staat', () => {
    const uit = { ...config, soarLift: 0 }
    for (let frame = 0; frame < 600; frame++) {
      expect(soarAngle(0.5, frame / 60, 0, uit)).toBeCloseTo(0, 12)
    }
  })
})

describe('de cursor loslaten als hij achter hem komt', () => {
  /* hij kijkt op het scherm omhoog; `rondom` legt een doel op hoek `t` om hem
     heen, met 0 recht vooruit en pi recht achter hem */
  const KIJKT = SCREEN_UP
  const rondom = (angle: number) => ({ x: Math.sin(angle), y: -Math.cos(angle) })

  it('houdt de kop volledig bij een doel recht vooruit', () => {
    expect(lookHold(KIJKT, rondom(0), config.lookGive)).toBe(1)
  })

  it('laat helemaal los bij een doel recht achter hem', () => {
    expect(lookHold(KIJKT, rondom(Math.PI), config.lookGive)).toBe(0)
    expect(lookHold(KIJKT, rondom(-Math.PI * 0.95), config.lookGive)).toBe(0)
  })

  it('laat geleidelijk los en nooit terug', () => {
    let previous = 1
    for (let step = 0; step <= 400; step++) {
      const hold = lookHold(KIJKT, rondom((step / 400) * Math.PI), config.lookGive)
      expect(hold).toBeLessThanOrEqual(previous + 1e-9)
      expect(previous - hold).toBeLessThan(0.05)
      previous = hold
    }
    expect(previous).toBe(0)
  })

  it('springt niet als de cursor helemaal om hem heen gaat', () => {
    /* Dit is de fout die hierachter zit. De hoek naar een doel recht achter hem
       klapt van +180° naar -180°, en zonder gewicht volgde de kop dat: die
       zwiepte in één frame van de ene uiterste stand naar de andere. Hier gaat
       de cursor de hele ronde om en mag er nergens een sprong in zitten. */
    const eigen = gazeYaw(12.5, config)
    let previous: number | null = null
    let biggest = 0
    let crossed = false

    /* van recht vooruit de hele ronde om, zodat hij halverwege dwars door de
       omslag achter hem heen gaat en niet er netjes langs */
    for (let step = 0; step <= 7200; step++) {
      const angle = (step / 7200) * Math.PI * 2
      const target = rondom(angle)
      const hold = lookHold(KIJKT, target, config.lookGive)
      const value = eigen * (1 - hold) + lookYaw(KIJKT, target, config.neckFollow) * hold

      if (previous !== null) biggest = Math.max(biggest, Math.abs(value - previous))
      if (Math.abs(angle - Math.PI) < 1e-3) crossed = true
      previous = value
    }

    /* zonder het gewicht was dit tweemaal neckFollow, dus 0,9 */
    expect(crossed).toBe(true)
    expect(biggest).toBeLessThan(0.01)
  })

  it('valt terug op zijn eigen blik en niet op recht vooruit', () => {
    const eigen = gazeYaw(12.5, config)
    const achter = rondom(Math.PI * 0.9)
    const hold = lookHold(KIJKT, achter, config.lookGive)

    expect(hold).toBe(0)
    expect(eigen * (1 - hold)).toBe(eigen)
  })

  it('doet niets bij een grens van nul', () => {
    expect(lookHold(KIJKT, rondom(0), 0)).toBe(0)
  })
})

describe('zijn eigen blik', () => {
  it('blijft binnen de ingestelde uitslag', () => {
    for (let step = 0; step < 4000; step++) {
      expect(Math.abs(gazeYaw(step * 0.05, config))).toBeLessThanOrEqual(config.gazeSweep + 1e-9)
    }
  })

  it('kijkt beide kanten op', () => {
    const values = Array.from({ length: 4000 }, (_, step) => gazeYaw(step * 0.05, config))
    expect(Math.min(...values)).toBeLessThan(-config.gazeSweep * 0.5)
    expect(Math.max(...values)).toBeGreaterThan(config.gazeSweep * 0.5)
  })

  it('loopt vloeiend', () => {
    let biggest = 0
    for (let step = 0; step < 4000; step++) {
      biggest = Math.max(
        biggest,
        Math.abs(gazeYaw(step / 60, config) - gazeYaw((step + 1) / 60, config)),
      )
    }
    expect(biggest).toBeLessThan(0.005)
  })

  it('staat stil als de uitslag op nul staat', () => {
    expect(gazeYaw(7.3, { ...config, gazeSweep: 0 })).toBe(0)
  })
})

describe('bearing', () => {
  it('geeft de ongeknipte hoek, ook voorbij de kopdraai', () => {
    expect(bearing(SCREEN_UP, SCREEN_UP)).toBeCloseTo(0, 9)
    expect(Math.abs(bearing(SCREEN_UP, { x: 0, y: 1 }))).toBeCloseTo(Math.PI, 9)
    expect(Math.abs(bearing(SCREEN_UP, SCREEN_RIGHT))).toBeCloseTo(Math.PI / 2, 9)
  })

  it('wijst naar dezelfde kant als de geknipte draai', () => {
    for (const kant of [SCREEN_LEFT, SCREEN_RIGHT]) {
      expect(Math.sign(bearing(SCREEN_UP, kant))).toBe(
        Math.sign(lookYaw(SCREEN_UP, kant, config.neckFollow)),
      )
    }
  })
})
