import { describe, expect, it } from 'vitest'
import { isChainBone, orderChain, type ChainNode } from '../rig'
import skeleton from './skeleton.json'

/**
 * Het echte skelet van public/models/dragon-flying.glb, 221 botten met hun
 * ouder-kindrelatie — en met de namen zoals **three.js** ze maakt, niet zoals
 * ze in het bestand staan.
 *
 * Dat verschil is precies waar dit eerder op stukliep. In het glb heet een bot
 * `tail_07.189_189_192`, maar `PropertyBinding.sanitizeNodeName` schrapt de punt
 * en dan staat er `tail_07189_189_192`. Een fixture met de bestandsnamen was
 * groen terwijl er in de browser niets gebeurde, dus de fixture komt nu door
 * dezelfde bewerking heen als de loader hem doet.
 */
type Row = { name: string; parent: number }

const build = (): ChainNode[] => {
  const rows = skeleton as Row[]
  const nodes: ChainNode[] = rows.map((row) => ({ name: row.name, parent: null, children: [] }))
  rows.forEach((row, index) => {
    if (row.parent < 0) return
    nodes[index].parent = nodes[row.parent]
    nodes[row.parent].children.push(nodes[index])
  })
  return nodes
}

const bones = build()
const named = (prefix: string) => orderChain(bones, prefix).map((bone) => bone.name)

describe('isChainBone', () => {
  it('herkent een schakel aan het cijfer achter het streepje', () => {
    expect(isChainBone('tail_07189_189_192', 'tail')).toBe(true)
    expect(isChainBone('tail_01', 'tail')).toBe(true)
  })

  it('laat de stekels erbuiten, die hangen al aan de keten', () => {
    /* draaien die ook los mee, dan waaieren ze uit */
    expect(isChainBone('tailSpike_01216_216_219', 'tail')).toBe(false)
    expect(isChainBone('tailBaseSpike_01220_220_223', 'tail')).toBe(false)
    expect(isChainBone('neckSpikeUp_0146_46_49', 'neck')).toBe(false)
    expect(isChainBone('spineSpike_01154_154_157', 'spine')).toBe(false)
  })

  it('trapt niet in een naam die er alleen mee begint', () => {
    expect(isChainBone('tailfin', 'tail')).toBe(false)
    expect(isChainBone('neckline_01', 'neck')).toBe(false)
  })
})

describe('orderChain op het echte skelet', () => {
  it('vindt de ketens compleet', () => {
    expect(named('tail')).toHaveLength(30)
    expect(named('neck')).toHaveLength(11)
    expect(named('spine')).toHaveLength(8)
  })

  it('begint bij de basis en loopt naar de punt', () => {
    const tail = named('tail')
    expect(tail[0].startsWith('tail_01')).toBe(true)
    expect(tail[tail.length - 1].startsWith('tail_30')).toBe(true)
  })

  it('loopt door de keten en niet door de volgorde van het bestand', () => {
    /* elke schakel hoort het kind te zijn van de vorige */
    const chain = orderChain(bones, 'tail')
    for (let index = 1; index < chain.length; index++) {
      expect(chain[index].parent).toBe(chain[index - 1])
    }
  })

  it('pakt geen stekels mee', () => {
    expect(named('tail').some((name) => name.includes('Spike'))).toBe(false)
    expect(named('neck').some((name) => name.includes('Spike'))).toBe(false)
  })

  it('geeft niets terug voor een keten die er niet is', () => {
    expect(named('wing')).toEqual([])
    expect(orderChain([], 'tail')).toEqual([])
  })

  it('stopt bij een gat in plaats van door te lopen', () => {
    /* twee losse stukjes: alleen het stuk vanaf de basis telt, de rest valt af
       en dan slaat de laag over in plaats van halve botten te draaien */
    const a: ChainNode = { name: 'tail_01', parent: null, children: [] }
    const b: ChainNode = { name: 'tail_02', parent: a, children: [] }
    a.children.push(b)
    const los: ChainNode = { name: 'tail_09', parent: null, children: [] }

    expect(orderChain([a, b, los], 'tail').map((bone) => bone.name)).toEqual(['tail_01', 'tail_02'])
  })
})
