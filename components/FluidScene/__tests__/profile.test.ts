import { describe, expect, it } from 'vitest'
import { applyProfile, dprCeiling, readProfile, type DeviceHints } from '../profile'
import { defaultConfig } from '../config'

const desktop: DeviceHints = { coarsePointer: false, cores: 10, width: 2560 }

describe('readProfile', () => {
  it('laat een gezonde desktop op vol staan', () => {
    expect(readProfile(desktop)).toBe('vol')
  })

  it('zet een aanraakscherm licht', () => {
    expect(readProfile({ ...desktop, coarsePointer: true })).toBe('licht')
  })

  it('zet een smal venster licht', () => {
    expect(readProfile({ ...desktop, width: 420 })).toBe('licht')
  })

  it('zet een apparaat met weinig kernen licht', () => {
    expect(readProfile({ ...desktop, cores: 4 })).toBe('licht')
    expect(readProfile({ ...desktop, cores: 2 })).toBe('licht')
  })

  it('valt terug op vol als de browser het aantal kernen niet zegt', () => {
    /* liever een onbekend apparaat op vol dan iedereen licht om één ontbrekend
       veld; de andere twee signalen vangen een telefoon toch wel */
    expect(readProfile({ ...desktop, cores: null })).toBe('vol')
  })

  it('heeft aan één signaal genoeg', () => {
    /* ze overlappen flink en dat is prima: het gaat erom dat een zwak apparaat
       er niet doorheen glipt, niet om een nette indeling */
    expect(readProfile({ coarsePointer: true, cores: 16, width: 2560 })).toBe('licht')
  })
})

describe('applyProfile', () => {
  it('laat de config met rust op vol', () => {
    expect(applyProfile(defaultConfig, 'vol')).toBe(defaultConfig)
  })

  it('haalt de simulatie en de roerpunten omlaag op licht', () => {
    const licht = applyProfile(defaultConfig, 'licht')

    expect(licht.simulation.resolution).toBe(512)
    expect(licht.object.stirPoints).toBe(8)
  })

  it('scheelt een factor in het werk dat de kaart moet doen', () => {
    /* een kwart van de pixels maal bijna de helft van de penselen; de penseellus
       draait immers per pixel over alle penselen */
    const vol = defaultConfig
    const licht = applyProfile(defaultConfig, 'licht')

    const werk = (c: typeof defaultConfig) =>
      c.simulation.resolution ** 2 * (c.object.stirPoints + 1)

    expect(werk(vol) / werk(licht)).toBeGreaterThan(6)
  })

  it('verhoogt nooit iets, ook niet als de config al lager staat', () => {
    const zuinig = {
      ...defaultConfig,
      object: { ...defaultConfig.object, stirPoints: 4 },
      simulation: { ...defaultConfig.simulation, resolution: 256 },
    }
    const licht = applyProfile(zuinig, 'licht')

    expect(licht.simulation.resolution).toBe(256)
    expect(licht.object.stirPoints).toBe(4)
  })

  it('laat de rest van de config ongemoeid', () => {
    const licht = applyProfile(defaultConfig, 'licht')

    expect(licht.painting).toEqual(defaultConfig.painting)
    expect(licht.background).toBe(defaultConfig.background)
    expect(licht.object.length).toBe(defaultConfig.object.length)
  })
})

describe('dprCeiling', () => {
  it('houdt een licht apparaat op één pixel per pixel', () => {
    expect(dprCeiling('licht')).toBe(1)
  })

  it('laat een gezond apparaat anderhalf', () => {
    expect(dprCeiling('vol')).toBe(1.5)
  })
})
