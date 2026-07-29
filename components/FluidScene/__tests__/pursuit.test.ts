import { describe, expect, it } from 'vitest'
import { createPursuitState, stepPursuit, WIDEST_ORBIT, type PursuitState } from '../pursuit'
import type { PursuitConfig, Vec2 } from '../types'

const config: PursuitConfig = {
  trailRate: 1.3,
  releaseRate: 0.2,
  orbitRadius: 0.55,
  orbitRate: 0.11,
}

const STEP = 1 / 60

/** doorrekenen en zowel het mikpunt als de cursor per frame bewaren */
const chase = (
  seconds: number,
  cursorAt: (t: number) => Vec2 | null,
  over: PursuitConfig = config,
) => {
  let state: PursuitState = createPursuitState()
  const track: { time: number; cursor: Vec2 | null; aim: Vec2 | null; trailing: Vec2 | null }[] = []

  for (let frame = 0; frame < seconds * 60; frame++) {
    const time = frame * STEP
    const cursor = cursorAt(time)
    const next = stepPursuit(state, cursor, over, STEP)
    state = next.state
    track.push({ time, cursor, aim: next.aim, trailing: state.trailing })
  }

  return track
}

const gap = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)

/* een cursor die rustig heen en weer zwenkt */
const zwenkend = (t: number): Vec2 => ({ x: Math.sin(t * 0.5) * 1.2, y: Math.cos(t * 0.37) * 0.5 })

describe('als je er niet bent', () => {
  /**
   * Hier zaten de twee sprongen die het happerig maakten. Vertrok je met je
   * muis, dan viel het mikpunt weg en verschoof zijn doel in één frame naar het
   * midden; kwam je terug, dan klapte het spoorpunt meteen op je cursor.
   */
  const wegEnTerug = (t: number): Vec2 | null =>
    t > 8 && t < 18 ? null : { x: 1.1, y: -0.4 }

  it('geeft nog steeds een mikpunt', () => {
    /* anders valt de vlucht terug op het midden, en dát is de sprong */
    for (const row of chase(20, wegEnTerug).slice(1)) expect(row.aim).not.toBeNull()
  })

  it('springt niet als je vertrekt', () => {
    const track = chase(20, wegEnTerug)
    const vertrek = 8 * 60

    for (let index = vertrek - 5; index < vertrek + 20; index++) {
      expect(gap(track[index].aim!, track[index - 1].aim!)).toBeLessThan(0.05)
    }
  })

  it('springt niet als je terugkomt', () => {
    const track = chase(20, wegEnTerug)
    const terug = 18 * 60

    for (let index = terug - 5; index < terug + 20; index++) {
      expect(gap(track[index].aim!, track[index - 1].aim!)).toBeLessThan(0.05)
    }
  })

  it('gaat ondertussen zijn eigen gang', () => {
    /* stilstaan is ook niet goed; hij hoort door te vliegen */
    const track = chase(120, () => null).slice(60 * 10)
    const xs = track.map((r) => r.aim!.x)

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3)
  })

  it('dwaalt niet weg maar blijft in beeld', () => {
    const track = chase(400, () => null).slice(60 * 10)
    for (const row of track) {
      expect(Math.abs(row.aim!.x)).toBeLessThan(1.6)
      expect(Math.abs(row.aim!.y)).toBeLessThan(1.2)
    }
  })

  it('laat je langzamer los dan hij je volgt', () => {
    /* Over dezelfde tijd hoort hij minder ver van je weg te zakken dan hij naar
       je toe zou komen. Anders is hij je vergeten voor je terug bent, en dan is
       het weglopen alsnog een sprong — alleen een trage. */
    const seconden = 3

    const losgelaten = chase(2 + seconden, (t) => (t > 2 ? null : { x: 1.4, y: 0 }))
    const weggezakt = 1.4 - losgelaten[losgelaten.length - 1].trailing!.x

    /* en hoe ver hij in diezelfde tijd wél naar een nieuw punt toe komt */
    const gevolgd = chase(2 + seconden, (t) => (t > 2 ? { x: 0, y: 0 } : { x: 1.4, y: 0 }))
    const ingehaald = 1.4 - gevolgd[gevolgd.length - 1].trailing!.x

    expect(weggezakt).toBeLessThan(ingehaald * 0.7)
  })
})

describe('achterlopen', () => {
  it('staat bij de eerste frame meteen op de cursor', () => {
    /* vanuit het midden komen aanvliegen terwijl je muis al ergens anders staat
       is een sprong die je bij het laden ziet */
    const track = chase(0.1, () => ({ x: 1.4, y: -0.6 }))
    expect(gap(track[0].trailing!, { x: 1.4, y: -0.6 })).toBeLessThan(0.05)
  })

  it('loopt achter op een sprong in plaats van hem te volgen', () => {
    const track = chase(4, (t) => ({ x: t < 2 ? -1.2 : 1.2, y: 0 }))
    const omslag = 2 * 60

    /* een halve seconde later is hij nog niet halverwege */
    expect(track[omslag + 30].trailing!.x).toBeLessThan(0)
  })

  it('haalt de cursor wel in als die stilligt', () => {
    const track = chase(10, () => ({ x: 1.2, y: -0.4 }))
    expect(gap(track[track.length - 1].trailing!, { x: 1.2, y: -0.4 })).toBeLessThan(0.01)
  })

  it('snijdt de bocht af bij een snelle zwenk', () => {
    /* wat een dier doet dat achter iets aan zit: de omkeerpunten haalt hij niet */
    const snel = (t: number): Vec2 => ({ x: Math.sin(t * 2.5) * 1.2, y: 0 })
    const track = chase(30, snel).slice(60 * 5)

    const cursorUit = Math.max(...track.map((r) => Math.abs(r.cursor!.x)))
    const volgUit = Math.max(...track.map((r) => Math.abs(r.trailing!.x)))

    expect(volgUit).toBeLessThan(cursorUit * 0.8)
  })
})

describe('eromheen hangen', () => {
  it('mikt naast je cursor en niet erop', () => {
    const track = chase(180, zwenkend).slice(60 * 10)
    const gemiddeld = track.reduce((sum, r) => sum + gap(r.aim!, r.cursor!), 0) / track.length

    expect(gemiddeld).toBeGreaterThan(0.2)
  })

  it('komt van alle kanten', () => {
    /* anders hangt hij altijd links en is het geen baan maar een verschuiving */
    const track = chase(180, () => ({ x: 0, y: 0 })).slice(60 * 5)
    const hoeken = new Set(
      track.map((r) => Math.round((Math.atan2(r.aim!.y, r.aim!.x) + Math.PI) / (Math.PI / 2))),
    )

    expect(hoeken.size).toBeGreaterThanOrEqual(4)
  })

  it('houdt de baan platter dan breed', () => {
    /* naar voren kost hem vleugelslagen; een even hoge baan laat hem voortdurend
       slaan om een rondje te maken */
    const track = chase(180, () => ({ x: 0, y: 0 })).slice(60 * 5)
    const breed = Math.max(...track.map((r) => Math.abs(r.aim!.x)))
    const hoog = Math.max(...track.map((r) => Math.abs(r.aim!.y)))

    expect(hoog).toBeLessThan(breed * 0.7)
  })

  it('blijft binnen de wijdste baan', () => {
    const track = chase(180, () => ({ x: 0, y: 0 })).slice(60 * 5)
    for (const row of track) {
      expect(Math.abs(row.aim!.x)).toBeLessThanOrEqual(config.orbitRadius * WIDEST_ORBIT + 1e-9)
    }
  })

  it('wisselt tussen dichtbij hangen en ver uitwijken', () => {
    /* een vaste afstand leest als een riem met speling; het gaat om de
       afwisseling, en die hoort traag te zijn zodat het een besluit lijkt */
    const track = chase(400, () => ({ x: 0, y: 0 })).slice(60 * 10)
    const straal = track.map((r) => Math.hypot(r.aim!.x, r.aim!.y))

    expect(Math.min(...straal)).toBeLessThan(config.orbitRadius * 0.4)
    expect(Math.max(...straal)).toBeGreaterThan(config.orbitRadius * 1.3)
  })

  it('komt niet op een vaste periode terug', () => {
    /* een zuivere cirkel op een vast tempo is precies zo mechanisch als
       eroverheen liggen, alleen op een andere manier */
    const track = chase(200, () => ({ x: 0, y: 0 }))
    const ronde = Math.round(60 / config.orbitRate)
    const nu = track.slice(60 * 20, 60 * 20 + 300).map((r) => r.aim!.x)
    const later = track.slice(60 * 20 + ronde, 60 * 20 + ronde + 300).map((r) => r.aim!.x)
    const verschil = nu.reduce((sum, v, i) => sum + Math.abs(v - later[i]), 0) / nu.length

    expect(verschil).toBeGreaterThan(0.05)
  })
})

describe('de knoppen', () => {
  it('valt terug op recht volgen als de baan op nul staat', () => {
    const strak = { ...config, orbitRadius: 0, trailRate: 60 }
    const track = chase(5, zwenkend, strak).slice(60)

    for (const row of track) expect(gap(row.aim!, row.cursor!)).toBeLessThan(0.03)
  })

  it('laat hem losser volgen bij een grotere straal', () => {
    const los = { ...config, orbitRadius: config.orbitRadius * 2 }
    const midden = (over: PursuitConfig) => {
      const track = chase(120, zwenkend, over).slice(60 * 10)
      return track.reduce((sum, r) => sum + gap(r.aim!, r.cursor!), 0) / track.length
    }

    expect(midden(los)).toBeGreaterThan(midden(config) * 1.4)
  })

  it('loopt vloeiend, zonder sprongen tussen twee frames', () => {
    const track = chase(120, zwenkend).slice(2)
    let grootste = 0
    for (let index = 1; index < track.length; index++) {
      grootste = Math.max(grootste, gap(track[index].aim!, track[index - 1].aim!))
    }

    expect(grootste).toBeLessThan(0.05)
  })
})
