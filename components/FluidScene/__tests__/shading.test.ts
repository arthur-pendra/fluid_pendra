import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { lightDirection, lightPosition, matcapTexture, matcapValue, smoothNormals } from '../shading'
import type { ShadingConfig } from '../types'

const config: ShadingConfig = {
  matcapBase: 0.12,
  matcapSweep: 0.8,
  matcapGloss: 0.7,
  matcapGlossWidth: 3,
  matcapRim: 0.6,
  matcapRimGap: 0.35,
  shadowTint: '#5c6f86',
  lightTint: '#f2ece2',
  rimTint: '#9fd4e8',
  iridescence: 0.12,
  iridescenceSpread: 1.6,
  lightAngle: 135,
  lightHeight: 0.55,
  lightPunch: 0.55,
  ambient: 0.8,
  shadeFloor: 0.35,
}

/**
 * Twee driehoeken die een dak vormen, met de nok gesplitst zoals een uv-naad dat
 * doet: vier vertices op twee plekken, waarvan de twee nokvertices op precies
 * dezelfde plek liggen maar elk maar één van de twee vlakken zien.
 *
 *      2/3 (nok, gesplitst)
 *      /\
 *     /  \
 *    0    1
 */
const roof = () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        -1, 0, 0, /* 0 links */
        0, 1, 0, /* 1 nok, helft A */
        -1, 0, 1, /* 2 links achter */
        0, 1, 0, /* 3 nok, helft B — zelfde plek als 1 */
        1, 0, 0, /* 4 rechts */
        1, 0, 1, /* 5 rechts achter */
      ]),
      3,
    ),
  )
  geometry.setIndex([0, 2, 1, 3, 4, 5])
  return geometry
}

describe('smoothNormals', () => {
  it('zet normalen op een model dat ze niet heeft', () => {
    const geometry = roof()
    expect(geometry.getAttribute('normal')).toBeUndefined()
    expect(smoothNormals(geometry)).toBe(true)
    expect(geometry.getAttribute('normal').count).toBe(6)
  })

  it('laat een model dat ze wél heeft met rust', () => {
    /* een export uit Blender brengt betere normalen mee dan wij kunnen maken,
       want daar zitten de harde randen van de rigger nog in */
    const geometry = roof()
    const own = new Float32Array(18).fill(0.5)
    geometry.setAttribute('normal', new BufferAttribute(own, 3))

    expect(smoothNormals(geometry)).toBe(false)
    expect(geometry.getAttribute('normal').array).toBe(own)
  })

  it('levert eenheidsvectoren', () => {
    const geometry = roof()
    smoothNormals(geometry)
    const normal = geometry.getAttribute('normal')

    for (let vertex = 0; vertex < normal.count; vertex++) {
      const length = Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex))
      expect(length).toBeCloseTo(1, 5)
    }
  })

  it('geeft twee vertices op dezelfde plek dezelfde normaal', () => {
    /* Dit is de hele reden dat deze functie bestaat. `computeVertexNormals`
       middelt per vertex, dus elke helft van een uv-naad houdt zijn eigen halve
       gemiddelde over — twee verschillende normalen op één plek, en dat is een
       scheur in de belichting. Op dit model raakt dat 32,5% van de vertices. */
    const geometry = roof()
    smoothNormals(geometry)
    const normal = geometry.getAttribute('normal')

    /* vertex 1 en 3 liggen allebei op de nok */
    expect(normal.getX(1)).toBeCloseTo(normal.getX(3), 6)
    expect(normal.getY(1)).toBeCloseTo(normal.getY(3), 6)
    expect(normal.getZ(1)).toBeCloseTo(normal.getZ(3), 6)
  })

  it('legt de nok precies tussen beide dakvlakken in', () => {
    /* Niet alleen "dezelfde normaal" maar ook de júiste: hij moet even ver van
       het ene vlak staan als van het andere. Zou er per vertex gemiddeld worden,
       dan zag elke helft maar één vlak en lag de normaal er vol tegenaan. */
    const geometry = roof()
    smoothNormals(geometry)
    const normal = geometry.getAttribute('normal')
    const ridge = new Vector3(normal.getX(1), normal.getY(1), normal.getZ(1))

    const faceNormal = (a: number[], b: number[], c: number[]) =>
      new Vector3()
        .subVectors(new Vector3(...b), new Vector3(...a))
        .cross(new Vector3().subVectors(new Vector3(...c), new Vector3(...a)))
        .normalize()

    const left = faceNormal([-1, 0, 0], [-1, 0, 1], [0, 1, 0])
    const right = faceNormal([0, 1, 0], [1, 0, 0], [1, 0, 1])

    expect(ridge.dot(left)).toBeCloseTo(ridge.dot(right), 6)
    expect(ridge.dot(left)).toBeGreaterThan(0)
  })
})

describe('lightDirection', () => {
  it('levert een eenheidsvector, welke stand ook', () => {
    for (let angle = 0; angle < 360; angle += 15) {
      for (const height of [0, 0.3, 0.55, 1]) {
        const direction = lightDirection({ ...config, lightAngle: angle, lightHeight: height })
        expect(direction.length()).toBeCloseTo(1, 6)
      }
    }
  })

  it('staat recht van voren op hoogte 1 en precies opzij op 0', () => {
    expect(lightDirection({ ...config, lightHeight: 1 }).z).toBeCloseTo(1, 6)
    expect(lightDirection({ ...config, lightHeight: 0 }).z).toBeCloseTo(0, 6)
  })
})

describe('matcapValue', () => {
  const light = lightDirection(config)

  it('is lichter aan de kant waar het licht vandaan komt', () => {
    const toward = matcapValue(light, light, config)
    const away = matcapValue({ x: -light.x, y: -light.y, z: light.z }, light, config)

    expect(toward).toBeGreaterThan(away)
  })

  it('zakt aan de schaduwkant niet naar nul', () => {
    /* half lambert: ook aan de donkere kant hoort er nog vorm te zien te zijn,
       anders wordt de schaduw een gat in het model */
    const value = matcapValue({ x: -light.x, y: -light.y, z: -light.z }, light, config)
    expect(value).toBeGreaterThan(0)
  })

  it('maakt de overgang korter naarmate sweep hoger staat', () => {
    /* dit is de knop die huid van metaal onderscheidt: hoe hoger, hoe meer van
       het lijf donker blijft en hoe scherper de rand naar het licht */
    const halfLit = { x: light.z, y: 0, z: -light.x }
    const kaal = { ...config, matcapGloss: 0, matcapRim: 0, matcapRimGap: 0 }

    const soft = matcapValue(halfLit, light, { ...kaal, matcapSweep: 0.5 })
    const hard = matcapValue(halfLit, light, { ...kaal, matcapSweep: 5 })

    expect(hard).toBeLessThan(soft)
  })

  it('licht het silhouet op via het randlicht', () => {
    /* een normaal die van de camera af buigt is de rand van het model */
    const edge = { x: 0, y: 1, z: 0 }
    const zonder = matcapValue(edge, light, { ...config, matcapRim: 0 })
    const met = matcapValue(edge, light, { ...config, matcapRim: 1 })

    expect(met - zonder).toBeGreaterThan(0.5)
  })

  it('legt een donkere band net binnen die rand', () => {
    /* Dit is wat van het randlicht een lijn maakt in plaats van een gloed. Zonder
       de band loopt de ramp gestaag op naar de rand en zie je hem niet los van
       het lijf liggen; mét de band zakt hij er eerst doorheen. */
    const at = (turn: number, over = config) => {
      const z = 1 - turn
      const flat = Math.sqrt(Math.max(0, 1 - z * z))
      return matcapValue({ x: 0, y: flat, z }, light, over)
    }

    /* op de rand zelf mag de band niets afdoen, anders eet hij het licht op */
    expect(at(1)).toBeCloseTo(at(1, { ...config, matcapRimGap: 0 }), 6)

    /* maar net erbinnen wel, en die dip hoort dieper te liggen dan de rand */
    const dip = at(1 - GAP_DEPTH)
    expect(dip).toBeLessThan(at(1))
    expect(dip).toBeLessThan(at(1, { ...config, matcapRimGap: 0 }))
  })

  it('maakt de glans breder naarmate glossWidth lager staat', () => {
    /* smal is een lichtpuntje op metaal, breed is de zachte bloem van de vis */
    const off = { x: light.x * 0.4, y: light.y * 0.4, z: Math.sqrt(1 - 0.16) }
    const kaal = { ...config, matcapSweep: 1, matcapRim: 0, matcapRimGap: 0 }

    const breed = matcapValue(off, light, { ...kaal, matcapGlossWidth: 2 })
    const smal = matcapValue(off, light, { ...kaal, matcapGlossWidth: 40 })

    expect(breed).toBeGreaterThan(smal)
  })
})

/* waar de band het diepst zit, gemeten vanaf de rand naar binnen */
const GAP_DEPTH = 0.38

describe('matcapTexture', () => {
  it('is vierkant en volledig dekkend', () => {
    const texture = matcapTexture(config)
    const { data, width, height } = texture.image as { data: Uint8Array; width: number; height: number }

    expect(width).toBe(height)
    for (let pixel = 0; pixel < width * height; pixel++) expect(data[pixel * 4 + 3]).toBe(255)
    texture.dispose()
  })

  it('draagt kleur en is niet grijs', () => {
    /* Dit is het verschil met de vis. Daar is de matcap grijs en komt de kleur
       uit hun koi-textuur; grijs maal een textuur is schaduw en geen materiaal.
       Hier loopt de ramp van een koele schaduw naar een warm licht. */
    const texture = matcapTexture(config)
    const { data, width } = texture.image as { data: Uint8Array; width: number }

    let coloured = 0
    for (let pixel = 0; pixel < width * width; pixel++) {
      const [r, g, b] = [data[pixel * 4], data[pixel * 4 + 1], data[pixel * 4 + 2]]
      if (Math.max(r, g, b) - Math.min(r, g, b) > 8) coloured++
    }

    expect(coloured / (width * width)).toBeGreaterThan(0.5)
    texture.dispose()
  })

  it('valt terug op grijs als de drie tinten grijs zijn', () => {
    /* zodat het recept van de vis nog steeds te maken is: dezelfde drie kleuren
       grijs en je hebt hun ramp terug */
    const grijs = {
      ...config,
      shadowTint: '#000000',
      lightTint: '#ffffff',
      rimTint: '#ffffff',
      iridescence: 0,
    }
    const texture = matcapTexture(grijs)
    const { data, width } = texture.image as { data: Uint8Array; width: number }

    for (let pixel = 0; pixel < width * width; pixel++) {
      expect(Math.abs(data[pixel * 4] - data[pixel * 4 + 1])).toBeLessThanOrEqual(1)
      expect(Math.abs(data[pixel * 4] - data[pixel * 4 + 2])).toBeLessThanOrEqual(1)
    }
    texture.dispose()
  })

  it('verschuift de tint met de hoek', () => {
    /* Wat een zeepbel doet: dezelfde plek is een andere kleur zodra hij
       wegdraait. Te zien als een verschil tussen de tint in het hart van de
       schijf en die op de rand, boven wat de schaduw-naar-licht-overgang al doet. */
    const hue = (over: typeof config) => {
      const texture = matcapTexture(over)
      const { data, width } = texture.image as { data: Uint8Array; width: number }
      const at = (x: number, y: number) => {
        const slot = (y * width + x) * 4
        return [data[slot], data[slot + 1], data[slot + 2]]
      }
      const mid = at(Math.floor(width / 2), Math.floor(width / 2))
      const rand = at(Math.floor(width * 0.03), Math.floor(width / 2))
      texture.dispose()
      /* het verschil in kleurbalans, niet in helderheid */
      const balance = (c: number[]) => (c[0] - c[2]) / Math.max(1, c[0] + c[1] + c[2])
      return Math.abs(balance(mid) - balance(rand))
    }

    expect(hue(config)).toBeGreaterThan(hue({ ...config, iridescence: 0 }))
  })

  it('gebruikt altijd het volle bereik, wat je ook instelt', () => {
    /* De ramp schaalt zichzelf voordat hij in acht bits gaat. Zonder dat liep hij
       op de standaardwaarden tot 1,73 en stond negen procent van de schijf vlak
       op wit — en dan schuift elke knop die je omhoog draait alleen méér vlak
       tegen dat plafond in plaats van de vorm te veranderen. */
    const grijs = {
      ...config,
      shadowTint: '#000000',
      lightTint: '#ffffff',
      rimTint: '#ffffff',
      iridescence: 0,
      matcapRim: 0,
    }
    const settings = [
      grijs,
      { ...grijs, matcapGloss: 4 },
      { ...grijs, matcapSweep: 6, matcapGloss: 0, matcapRimGap: 0 },
      { ...grijs, matcapBase: 0.5, matcapGloss: 0.1 },
    ]

    for (const over of settings) {
      const texture = matcapTexture(over)
      const { data } = texture.image as { data: Uint8Array }

      let low = 255
      let high = 0
      for (let pixel = 0; pixel < data.length; pixel += 4) {
        low = Math.min(low, data[pixel])
        high = Math.max(high, data[pixel])
      }

      expect(low).toBe(0)
      expect(high).toBe(255)
      texture.dispose()
    }
  })

  it('legt het licht aan de kant die lightAngle aanwijst', () => {
    /* de schijf loopt van -1 tot 1 over beide assen, dus de hoek is meteen de
       plek waar de lichte kant hoort te liggen */
    const texture = matcapTexture({ ...config, lightAngle: 0, matcapRim: 0 })
    const { data, width } = texture.image as { data: Uint8Array; width: number }

    const at = (x: number, y: number) => data[(y * width + x) * 4]
    const middle = Math.floor(width / 2)
    const quarter = Math.floor(width / 4)

    expect(at(middle + quarter, middle)).toBeGreaterThan(at(middle - quarter, middle))
    texture.dispose()
  })
})

describe('lightPosition', () => {
  it('staat op afstand van het midden', () => {
    expect(lightPosition(config).length()).toBeGreaterThan(1)
  })

  it('draait mee met lightAngle', () => {
    const links = lightPosition({ ...config, lightAngle: 180 })
    const rechts = lightPosition({ ...config, lightAngle: 0 })

    expect(rechts.x).toBeGreaterThan(links.x)
  })

  it('komt uit dezelfde hoek als de glans', () => {
    /* De matcap kijkt langs +z en de objectscene langs +y; gaan die twee assen
       niet door elkaar heen, dan komt de lamp uit een andere hoek dan de glans
       en zie je twee lichtbronnen die er maar één hoort te zijn. */
    const direction = lightDirection(config)
    const lamp = lightPosition(config).normalize()

    expect(lamp.x).toBeCloseTo(direction.x, 6)
    expect(lamp.y).toBeCloseTo(direction.z, 6)
    expect(new Vector3(lamp.x, lamp.y, lamp.z).length()).toBeCloseTo(1, 6)
  })
})
