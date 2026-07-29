import { describe, expect, it } from 'vitest'
import { createDiveState, diveControl, diveFoldsWings, diveNeedsBeat, stepDive } from '../dive'
import type { DiveConfig } from '../types'

const config: DiveConfig = {
  diveEvery: 10,
  diveSpeed: 1.1,
  diveAcceleration: 3.2,
  diveDepth: 12,
  pitchTime: 1.6,
  fogDepth: 1.6,
  awayTime: 5,
  enterRate: 1.1,
  enterGap: 0.08,
}

const bounds = { x: 2, y: 1 }
const flying = { x: 0.3, y: -0.2 }

/** een stap van 1/60, met vaste willekeur zodat de uitkomst te controleren is */
const step = (state: ReturnType<typeof createDiveState>, over: Partial<Parameters<typeof stepDive>[2]> = {}) =>
  stepDive(state, config, {
    /* standaard ben je er gewoon; de tests die over wegblijven gaan zetten dit
       zelf om */
    idle: false,
    beatsAdvanced: 0,
    flying,
    bounds,
    delta: 1 / 60,
    random: () => 0.25,
    ...over,
  })

/** doorstappen tot de stand verandert, met een plafond zodat een test niet hangt */
const until = (
  start: ReturnType<typeof createDiveState>,
  stage: string,
  over: Partial<Parameters<typeof stepDive>[2]> = {},
) => {
  let state = start
  for (let frame = 0; frame < 4000 && state.stage !== stage; frame++) state = step(state, over)
  return state
}

describe('stepDive', () => {
  it('blijft vliegen zolang er nog niet genoeg slagen zijn', () => {
    let state = createDiveState()
    for (let beat = 0; beat < 9; beat++) state = step(state, { beatsAdvanced: 1 })

    expect(state.stage).toBe('flying')
    expect(state.beats).toBe(9)
  })

  it('duikt zodra het aantal slagen bereikt is', () => {
    let state = createDiveState()
    for (let beat = 0; beat < 10; beat++) state = step(state, { beatsAdvanced: 1 })

    expect(state.stage).toBe('diving')
    expect(state.beats).toBe(0)
  })

  it('begint de duik waar hij op dat moment vliegt', () => {
    let state = createDiveState()
    for (let beat = 0; beat < 10; beat++) state = step(state, { beatsAdvanced: 1 })

    expect(state.place).toEqual(flying)
  })

  it('duikt nooit als het op nul staat', () => {
    let state = createDiveState()
    const off = { ...config, diveEvery: 0 }
    for (let beat = 0; beat < 200; beat++) {
      state = stepDive(state, off, {
        idle: false,
        beatsAdvanced: 1,
        flying,
        bounds,
        delta: 1 / 60,
        random: () => 0.25,
      })
    }

    expect(state.stage).toBe('flying')
  })

  it('duikt in een boog: eerst vooruit, dan de diepte in', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })

    /* vooruit is een dalende y, en dat gebeurt vooral zolang hij nog vlak ligt */
    let early = diving
    for (let frame = 0; frame < 10; frame++) early = step(early)
    expect(early.place.y).toBeLessThan(diving.place.y)

    const forwardEarly = Math.abs(early.place.y - diving.place.y)
    const downEarly = Math.abs(early.depth - diving.depth)
    expect(forwardEarly).toBeGreaterThan(downEarly)

    /* doorstappen tot de neus echt over is, want de kanteling is geëgaliseerd
       en doet er een seconde of anderhalf over */
    let over = early
    for (let frame = 0; frame < 400 && over.pitch > -85 && over.stage === 'diving'; frame++) {
      over = step(over)
    }
    expect(over.pitch).toBeLessThanOrEqual(-85)

    /* en dan is het omgeklapt: het gaat nu veel meer de diepte in dan vooruit */
    let after = over
    for (let frame = 0; frame < 20; frame++) after = step(after)
    const forwardLate = Math.abs(after.place.y - over.place.y)
    const downLate = Math.abs(after.depth - over.depth)
    expect(downLate).toBeGreaterThan(forwardLate)

    /* zijwaarts blijft hij waar hij was; dit is een duik en geen bocht */
    expect(after.place.x).toBe(diving.place.x)
  })

  it('brengt de neus omlaag voordat hij echt wegvalt', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })
    let state = diving
    for (let frame = 0; frame < 30; frame++) state = step(state)

    /* de kanteling loopt voor: al flink overgeheld terwijl hij nog nauwelijks weg is */
    expect(state.pitch).toBeLessThan(-10)
    expect(Math.abs(state.depth)).toBeLessThan(0.5)
    expect(state.pitch).toBeGreaterThan(-90)
  })

  it('zet de kanteling zacht in in plaats van meteen om te klappen', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })

    const first = step(diving)
    const opening = Math.abs(first.pitch - diving.pitch)

    let middle = diving
    for (let frame = 0; frame < 30; frame++) middle = step(middle)
    const halfway = Math.abs(step(middle).pitch - middle.pitch)

    /* halverwege draait hij veel harder dan in de eerste frame; bij een
       exponentiële nadering zou het precies andersom zijn */
    expect(halfway).toBeGreaterThan(opening * 3)
  })

  it('valt steeds harder in plaats van op een vast tempo', () => {
    const state = until(createDiveState(), 'diving', { beatsAdvanced: 1 })

    let early = state
    for (let frame = 0; frame < 6; frame++) early = step(early)
    const earlyStep = early.depth - step(early).depth

    let later = early
    for (let frame = 0; frame < 20; frame++) later = step(later)
    const lastStep = later.depth - step(later).depth

    expect(lastStep).toBeGreaterThan(earlyStep)
  })

  it('gaat pas weg als hij ver genoeg van de camera is', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })
    const away = until(diving, 'away')

    expect(away.depth).toBeLessThan(-config.diveDepth)
  })

  it('duikt zodra je hem met rust laat, ook zonder de teller', () => {
    const off = { ...config, diveEvery: 0 }
    const state = stepDive(createDiveState(), off, {
      idle: true,
      beatsAdvanced: 1,
      flying,
      bounds,
      delta: 1 / 60,
      random: () => 0.25,
    })

    expect(state.stage).toBe('diving')
  })

  it('wacht op een slag, ook als je hem allang met rust laat', () => {
    let state = createDiveState()
    for (let frame = 0; frame < 60 * 10; frame++) state = step(state, { idle: true })

    /* tien seconden stilte en nog steeds vliegend: een duik zonder een slag
       eronder valt om in plaats van te steken */
    expect(state.stage).toBe('flying')

    expect(step(state, { idle: true, beatsAdvanced: 1 }).stage).toBe('diving')
  })

  it('vraagt om die slag zolang hij wil gaan en niet langer', () => {
    const flyingState = createDiveState()

    expect(diveNeedsBeat(flyingState, false)).toBe(false)
    expect(diveNeedsBeat(flyingState, true)).toBe(true)

    /* eenmaal onderweg doet het slaan er niet meer toe: de vleugels gaan dicht */
    const diving = step(flyingState, { idle: true, beatsAdvanced: 1 })
    expect(diveNeedsBeat(diving, true)).toBe(false)
  })

  it('gaat niet meer duiken als je weer beweegt voordat de slag rond is', () => {
    let state = createDiveState()
    for (let frame = 0; frame < 60; frame++) state = step(state, { idle: true })

    /* de slag komt binnen, maar jij bent er inmiddels weer */
    expect(step(state, { idle: false, beatsAdvanced: 1 }).stage).toBe('flying')
  })

  it('blijft weg zolang je niets doet', () => {
    const away = until(
      until(createDiveState(), 'diving', { idle: true, beatsAdvanced: 1 }),
      'away',
      { idle: true },
    )

    let state = away
    for (let frame = 0; frame < 60 * 30; frame++) state = step(state, { idle: true })

    /* ruim zes keer de vaste tijd verder en nog steeds weg: dit wacht op jou en
       niet op de klok */
    expect(state.stage).toBe('away')
  })

  it('komt alsnog terug als je bewoog terwijl hij nog weg moest blijven', () => {
    let state = until(
      until(createDiveState(), 'diving', { idle: true, beatsAdvanced: 1 }),
      'away',
      { idle: true },
    )

    /* één beweging, ruim binnen de tijd dat hij nog niet mág komen */
    state = step(state, { idle: false })
    expect(state.stage).toBe('away')

    /* en daarna doe je niets meer. Hij hoort dat ene teken te onthouden in
       plaats van te wachten op een beweging die je al gedaan hebt */
    for (let frame = 0; frame < 60 * 10; frame++) {
      state = step(state, { idle: true })
      if (state.stage !== 'away') break
    }

    expect(state.stage).toBe('entering')
  })

  it('komt niet terug als je je helemaal niet laat zien', () => {
    let state = until(
      until(createDiveState(), 'diving', { idle: true, beatsAdvanced: 1 }),
      'away',
      { idle: true },
    )
    for (let frame = 0; frame < 60 * 30; frame++) state = step(state, { idle: true })

    expect(state.stage).toBe('away')
  })

  it('komt terug zodra je weer beweegt', () => {
    let state = until(
      until(createDiveState(), 'diving', { idle: true, beatsAdvanced: 1 }),
      'away',
      { idle: true },
    )
    for (let frame = 0; frame < 60 * 20; frame++) state = step(state, { idle: true })

    /* nog één stap, nu met een cursor die weer meedoet */
    const woken = step(state, { idle: false })

    expect(woken.stage).toBe('entering')
  })

  it('blijft de ingestelde tijd weg', () => {
    const away = until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away')

    let state = away
    let seconds = 0
    while (state.stage === 'away' && seconds < 10) {
      state = step(state)
      seconds += 1 / 60
    }

    expect(seconds).toBeGreaterThanOrEqual(config.awayTime)
    expect(seconds).toBeLessThan(config.awayTime + 0.2)
  })

  it('komt van buiten beeld terug, aan de kant die de willekeur aanwijst', () => {
    const away = until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away')

    const left = until(away, 'entering', { random: () => 0.25 })
    const right = until(away, 'entering', { random: () => 0.75 })

    expect(left.side).toBe(-1)
    expect(right.side).toBe(1)
    expect(Math.abs(left.place.x)).toBeGreaterThan(bounds.x)
    expect(Math.abs(right.place.x)).toBeGreaterThan(bounds.x)
  })

  it('is al uit de mist voordat hij de helft van de oversteek heeft gedaan', () => {
    const entering = until(
      until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away'),
      'entering',
    )

    let state = entering
    const half = Math.abs(entering.place.x) / 2
    while (Math.abs(state.place.x) > half && state.stage === 'entering') state = step(state)

    /* zichtbaar betekent binnen de fog-diepte, anders vliegt hij als mist binnen */
    expect(Math.abs(state.depth)).toBeLessThan(config.fogDepth)
  })

  it('komt terug op een hoogte binnen beeld', () => {
    const entering = until(
      until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away'),
      'entering',
    )

    expect(Math.abs(entering.entry)).toBeLessThanOrEqual(bounds.y)
  })

  it('vliegt naar binnen en geeft de besturing daarna terug', () => {
    const entering = until(
      until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away'),
      'entering',
    )
    const back = until(entering, 'flying')

    expect(back.stage).toBe('flying')
    expect(Math.abs(back.place.x)).toBeLessThan(config.enterGap)
    expect(back.beats).toBe(0)
  })
})

describe('wie de besturing heeft', () => {
  it('laat de cursor met rust tot hij weer in beeld komt', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })
    const away = until(diving, 'away')
    const entering = until(away, 'entering')

    expect(diveControl(createDiveState(), config, bounds)).toBe(0)
    expect(diveControl(diving, config, bounds)).toBe(1)
    expect(diveControl(away, config, bounds)).toBe(1)
    /* net buiten beeld begonnen, dus nog helemaal van de manoeuvre */
    expect(diveControl(entering, config, bounds)).toBe(1)
  })

  it('geeft de besturing geleidelijk terug over het invliegen', () => {
    const entering = until(
      until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away'),
      'entering',
    )

    let state = entering
    let control = diveControl(state, config, bounds)
    let loosened = 0

    while (state.stage === 'entering') {
      const next = step(state)
      const after = diveControl(next, config, bounds)

      /* nooit terug: de cursor krijgt zeggenschap en raakt die niet meer kwijt */
      expect(after).toBeLessThanOrEqual(control + 1e-9)
      /* en nooit in één sprong; dit is een verloop en geen schakelaar */
      expect(control - after).toBeLessThan(0.05)

      if (after < 0.99 && loosened === 0) loosened = Math.abs(next.place.x)
      state = next
      control = after
    }

    /* het loslaten begint zodra hij in beeld is, niet pas bij het midden */
    expect(loosened).toBeGreaterThan(bounds.x * 0.5)
    expect(control).toBe(0)
  })

  it('staat op nul op het moment dat de stand omslaat', () => {
    const entering = until(
      until(until(createDiveState(), 'diving', { beatsAdvanced: 1 }), 'away'),
      'entering',
    )

    /* de laatste frame vóór de omslag opzoeken */
    let state = entering
    let last = entering
    while (state.stage === 'entering') {
      last = state
      state = step(state)
    }

    /* bleef hier een restje staan, dan viel dat er bij de omslag alsnog in één
       frame af, en dat is precies de sprong die we kwijt wilden. Nul op een
       frame na, want de omslag valt tussen twee stappen in */
    expect(diveControl(last, config, bounds)).toBeLessThan(0.001)
    expect(diveControl(state, config, bounds)).toBe(0)
  })

  it('klapt de vleugels alleen in tijdens het vallen en niet bij het invliegen', () => {
    const diving = until(createDiveState(), 'diving', { beatsAdvanced: 1 })
    const away = until(diving, 'away')
    const entering = until(away, 'entering')

    expect(diveFoldsWings(createDiveState())).toBe(false)
    expect(diveFoldsWings(diving)).toBe(true)
    expect(diveFoldsWings(away)).toBe(true)
    expect(diveFoldsWings(entering)).toBe(false)
  })
})
