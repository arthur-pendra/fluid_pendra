import { describe, expect, it } from 'vitest'
import { beatProfile, sampleProfile } from '../beat'

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
