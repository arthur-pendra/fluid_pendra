import { describe, expect, it } from 'vitest'
import { beatProfile, clipRate, sampleProfile, soarPhases } from '../beat'

/* zoals de meting eruitziet: lang traag zweven, dan een korte snelle slag */
const SPEEDS = [0.1, 0.1, 0.1, 0.1, 0.9, 1.6, 0.9, 0.2, 0.1, 0.1, 0.1, 0.1]

const traversal = (profile: number[]) =>
  profile.reduce((sum, scale) => sum + 1 / scale, 0) / profile.length

describe('beatProfile', () => {
  it('laat de clip gelijkmatig lopen als de knop op nul staat', () => {
    for (const scale of beatProfile(SPEEDS, 0)) {
      expect(scale).toBeCloseTo(1, 9)
    }
  })

  it('laat de klok trager lopen waar de vleugels traag bewegen', () => {
    const profile = beatProfile(SPEEDS, 1)

    /* het zweven zit op index 0, de slag op index 5 */
    expect(profile[0]).toBeLessThan(1)
    expect(profile[5]).toBeGreaterThan(1)
    expect(profile[5]).toBeGreaterThan(profile[0])
  })

  it('houdt de rondgang even lang, wat de knop ook staat', () => {
    /* anders verzet de knop ook het tempo, en dan stel je twee dingen tegelijk
       af zonder dat je weet welke je ziet */
    const even = traversal(beatProfile(SPEEDS, 0))
    for (const hold of [0.5, 1, 1.5, 2.5]) {
      expect(traversal(beatProfile(SPEEDS, hold))).toBeCloseTo(even, 9)
    }
  })

  it('maakt het verschil groter naarmate de knop hoger staat', () => {
    const zacht = beatProfile(SPEEDS, 0.5)
    const hard = beatProfile(SPEEDS, 2)

    const spread = (profile: number[]) => Math.max(...profile) / Math.min(...profile)
    expect(spread(hard)).toBeGreaterThan(spread(zacht))
  })

  it('zet de klok niet stil op een moment dat er niets beweegt', () => {
    /* een clip met een stilstaand moment zou anders blijven hangen */
    const profile = beatProfile([0, 1, 2, 1], 2)

    for (const scale of profile) expect(scale).toBeGreaterThan(0)
    expect(profile.every(Number.isFinite)).toBe(true)
  })

  it('houdt het gelijkmatig als er niets te meten valt', () => {
    expect(beatProfile([], 1)).toEqual([])
    for (const scale of beatProfile([0, 0, 0], 1)) expect(scale).toBe(1)
  })
})

describe('sampleProfile', () => {
  it('leest de bemonsteringspunten terug', () => {
    const profile = [1, 2, 3, 4]
    expect(sampleProfile(profile, 0)).toBeCloseTo(1, 9)
    expect(sampleProfile(profile, 0.25)).toBeCloseTo(2, 9)
    expect(sampleProfile(profile, 0.5)).toBeCloseTo(3, 9)
  })

  it('mengt tussen twee punten', () => {
    expect(sampleProfile([1, 3], 0.25)).toBeCloseTo(2, 9)
  })

  it('sluit de cirkel, want de clip herhaalt', () => {
    /* zonder dit maakt de klok een sprong op het omslagpunt van de clip */
    const profile = [1, 2, 3, 4]
    expect(sampleProfile(profile, 0.875)).toBeCloseTo(2.5, 9)
    expect(sampleProfile(profile, 1)).toBeCloseTo(sampleProfile(profile, 0), 9)
  })

  it('verdraagt een fase buiten nul tot een', () => {
    const profile = [1, 2, 3, 4]
    expect(sampleProfile(profile, 2.25)).toBeCloseTo(sampleProfile(profile, 0.25), 9)
    expect(sampleProfile(profile, -0.75)).toBeCloseTo(sampleProfile(profile, 0.25), 9)
  })

  it('valt terug op een gelijkmatige klok zonder profiel', () => {
    expect(sampleProfile([], 0.5)).toBe(1)
    expect(sampleProfile([2], 0.5)).toBe(2)
  })
})

/* vier slagen in één rondgang, zoals de echte clip: lang zweven, korte slag */
const VIER = Array.from({ length: 24 }, (_, index) => {
  const beat = ((index / 24) * 4) % 1
  return beat < 0.25 ? 0.3 + Math.sin((beat / 0.25) * Math.PI) * 1.5 : 0.3
})

describe('soarPhases', () => {
  it('wijst alleen trage momenten aan en nooit een slag', () => {
    const mean = VIER.reduce((sum, value) => sum + value, 0) / VIER.length
    const phases = soarPhases(VIER)

    expect(phases.length).toBeGreaterThan(0)
    for (const phase of phases) {
      expect(VIER[Math.floor(phase * VIER.length)]).toBeLessThan(mean)
    }
  })

  it('vindt er minstens één per slag, zodat hij nooit lang hoeft te wachten', () => {
    /* dit is waar het op stukliep: met één mikpunt voor de hele rondgang moest
       hij soms drie slagen door voordat hij mocht stoppen */
    const phases = soarPhases(VIER).sort((a, b) => a - b)

    let biggest = phases[0] + (1 - phases[phases.length - 1])
    for (let index = 1; index < phases.length; index++) {
      biggest = Math.max(biggest, phases[index] - phases[index - 1])
    }

    /* nooit meer dan een kwart rondgang tussen twee gelegenheden: vier slagen */
    expect(biggest).toBeLessThanOrEqual(0.26)
  })

  it('geeft iets bruikbaars terug voor een clip zonder trage momenten', () => {
    expect(soarPhases([])).toEqual([])
    expect(soarPhases([1, 1, 1, 1])).toEqual([0.5])
    expect(soarPhases([0, 0, 0])).toEqual([0.5])
  })
})

describe('clipRate', () => {
  const profile = beatProfile(VIER, 0)
  const soars = soarPhases(VIER)

  it('laat de slag zijn eigen tempo houden als de vleugels werken', () => {
    /* de hele clip vertragen zag eruit als doorklapwieken in slow motion */
    for (const phase of [0, 0.2, 0.5, 0.9]) {
      expect(clipRate(profile, soars, phase, 1, 0.08)).toBeCloseTo(
        sampleProfile(profile, phase),
        9,
      )
    }
  })

  it('komt tot stilstand in een zweefstand', () => {
    expect(clipRate(profile, soars, soars[0], 0, 0.08)).toBeCloseTo(0, 9)
  })

  it('maakt de slag waar hij in zit eerst af', () => {
    /* net voorbij een zweefstand loopt hij op tempo door in plaats van halverwege
       te bevriezen */
    const net = soars[0] + 0.03
    expect(clipRate(profile, soars, net, 0, 0.02)).toBeCloseTo(sampleProfile(profile, net), 9)
  })

  it('staat snel stil in plaats van langzaam uit te lopen', () => {
    /* Twee dingen tegelijk, want ze veroorzaakten samen het probleem: hij mikt op
       de eerstvolgende zweefstand en niet op de verste, én het afremmen is
       lineair en niet met een smoothstep. Met de verste zat hij de hele rondgang
       uit, en met de smoothstep kroop hij daarna nog elf seconden door. */
    const brake = 0.08
    let phase = 0.5
    let frames = 0
    while (clipRate(profile, soars, phase, 0, brake) > 0.02 && frames < 60 * 60) {
      phase = (phase + (clipRate(profile, soars, phase, 0, brake) / 3.3) / 60) % 1
      frames++
    }

    expect(frames / 60).toBeLessThan(1.5)
  })

  it('kan een zweefstand niet voorbijschieten', () => {
    /* De stap is evenredig met wat er nog te gaan is, dus altijd kleiner dan de
       rest. Zou hij er wél overheen schieten, dan wordt de afstand tot de
       eerstvolgende ineens bijna een hele rondgang en gaat hij die uitzitten —
       zichtbaar als vleugels die opeens weer een slag maken. */
    const tot = (from: number) => Math.min(...soars.map((s) => (((s - from) % 1) + 1) % 1))

    const start = soars[2] - 0.05
    const teGaan = tot(start)
    let phase = start
    for (let frame = 0; frame < 60 * 30; frame++) {
      phase += (clipRate(profile, soars, phase, 0, 0.08) / 3.3) * (1 / 60)
    }

    /* hij staat op een zweefstand, en heeft daarvoor niet meer afgelegd dan er
       te gaan was: geen extra rondgang */
    expect(tot(phase)).toBeLessThan(0.002)
    expect(phase - start).toBeLessThanOrEqual(teGaan + 1e-9)
  })

  it('gaat vloeiend in elkaar over', () => {
    /* geen sprong bij het aan- en uitgaan, anders zie je de omslag */
    let vorige = clipRate(profile, soars, 0.3, 0, 0.08)
    for (let step = 1; step <= 100; step++) {
      const nu = clipRate(profile, soars, 0.3, step / 100, 0.08)
      expect(Math.abs(nu - vorige)).toBeLessThan(0.15)
      vorige = nu
    }
  })

  it('valt terug op het profiel zonder zweefstanden', () => {
    expect(clipRate(profile, [], 0.3, 0, 0.08)).toBeCloseTo(sampleProfile(profile, 0.3), 9)
  })
})
