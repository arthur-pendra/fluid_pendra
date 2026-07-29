import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config'
import { createFlightState, stepFlight, type FlightState } from '../flight'
import { createDiveState, diveControl, stepDive, type DiveState } from '../dive'

/**
 * De overgave, van de duik terug naar de cursor.
 *
 * Dit staat los van dive.test.ts omdat het juist over de naad tussen twee
 * bestanden gaat: elk van de twee klopt op zichzelf, en toch was er iets te
 * zien. Het invliegen dooft uit naar het midden toe, dus op het punt waar de
 * cursor het overnam stond hij vrijwel stil en begon het vliegen daar met de
 * volle achterstand. Gemeten sprong in één frame: van 0,09 naar 1,60 eenheden
 * per seconde, met de kanteling die meteen meesloeg.
 *
 * De lus hieronder is dezelfde als in FluidRig, en dat is de reden dat deze
 * test bestaat: die volgorde is waar het misging.
 */

const object = defaultConfig.object
const bounds = { x: 1.78, y: 1 }
const reach = { x: object.reachSide * bounds.x, y: object.reachAhead * bounds.y }
const delta = 1 / 60

type Frame = { stage: DiveState['stage']; speed: number; bank: number }

/** de lus van FluidRig, met een vaste cursor en een vaste kant om in te vliegen */
const fly = (cursor: { x: number; y: number }, side: number): Frame[] => {
  let flight: FlightState = createFlightState(object)
  let dive = createDiveState()
  let previous = flight.position.x
  const frames: Frame[] = []

  for (let index = 0; index < 60 * 40; index++) {
    flight = stepFlight(
      flight,
      object,
      0,
      diveControl(dive, object, bounds) < 1 ? cursor : null,
      reach,
      delta,
    )

    dive = stepDive(dive, object, {
      /* eerst tien seconden niets doen, zodat hij duikt en wegblijft, en daarna
         de muis weer oppakken zodat hij terugkomt. De overgave daarna is waar
         het hier om gaat. */
      idle: index < 600,
      /* een slag per vijftig frames, zoals de clip er ongeveer vier doet per
         rondgang van 3,3 seconde; de duik begint op zo'n grens */
      beatsAdvanced: index % 50 === 0 ? 1 : 0,
      flying: flight.position,
      bounds,
      delta,
      random: () => (side > 0 ? 0.75 : 0.25),
    })

    const held = diveControl(dive, object, bounds)
    if (held > 0) {
      const place = dive.place
      const here = flight.position
      flight = {
        ...flight,
        position: {
          x: here.x + (place.x - here.x) * held,
          y: here.y + (place.y - here.y) * held,
        },
      }
    }

    frames.push({
      stage: dive.stage,
      speed: (flight.position.x - previous) / delta,
      bank: flight.bank,
    })
    previous = flight.position.x
  }

  return frames
}

/** de eerste frame waarop hij het invliegen achter zich laat */
const handoverAt = (frames: Frame[]) =>
  frames.findIndex(
    (frame, index) => index > 0 && frames[index - 1].stage === 'entering' && frame.stage === 'flying',
  )

/**
 * De frames rondom de wissel, en dat is met opzet een venster en geen enkele
 * frame: de stand slaat om vóórdat de nieuwe koers gereden wordt, dus de sprong
 * viel altijd één frame ná de omslag.
 */
const around = (frames: Frame[], at: number) => frames.slice(at - 1, at + 6)

/** de grootste verandering tussen twee frames, in snelheid of in kanteling */
const roughest = (frames: Frame[], of: keyof Omit<Frame, 'stage'> = 'speed') =>
  Math.max(...frames.slice(1).map((frame, index) => Math.abs(frame[of] - frames[index][of])))

/* van de overkant, van dezelfde kant, en met de cursor uit beeld */
const cases = [
  { name: 'de cursor aan de overkant', cursor: { x: 1.69, y: 0 }, side: -1 },
  { name: 'de cursor aan de kant waar hij binnenkomt', cursor: { x: 1.69, y: 0 }, side: 1 },
  { name: 'de cursor vlak bij het midden', cursor: { x: 0.1, y: -0.3 }, side: 1 },
]

describe('van de duik terug naar de cursor', () => {
  cases.forEach(({ name, cursor, side }) => {
    it(`gaat vloeiend over met ${name}`, () => {
      const frames = fly(cursor, side)
      const at = handoverAt(frames)
      expect(at).toBeGreaterThan(0)

      /* hoe hard het onderweg al schommelde, als maat om tegen af te zetten:
         de overgave mag niet meer zijn dan wat het invliegen zelf al doet */
      const usual = roughest(frames.slice(at - 60, at))
      const jump = roughest(around(frames, at))

      expect(jump).toBeLessThanOrEqual(usual * 1.5 + 1e-6)

      /* en in absolute zin: vóór de menging was dit 1,72 */
      expect(jump).toBeLessThan(0.05)
    })

    it(`laat het lijf niet omslaan bij de overgave met ${name}`, () => {
      const frames = fly(cursor, side)
      const at = handoverAt(frames)

      /* de kanteling hangt aan de zijwaartse snelheid, dus die sloeg mee om:
         gemeten van +3° naar -3° binnen een tiende seconde */
      const usual = roughest(frames.slice(at - 60, at), 'bank')
      const swung = roughest(around(frames, at), 'bank')

      expect(swung).toBeLessThanOrEqual(usual * 1.5 + 1e-6)
      expect(swung).toBeLessThan(0.5)
    })

    it(`keert niet om op het moment van de overgave met ${name}`, () => {
      const window = around(fly(cursor, side), handoverAt(fly(cursor, side)))
      const before = window[0].speed
      const after = window[window.length - 1].speed

      /* de richting mag onderweg best omslaan, maar niet dóór de wissel: dat is
         wat "hij zoekt opeens mijn muis" eruit ziet */
      if (Math.abs(before) > 0.05) expect(Math.sign(after)).toBe(Math.sign(before))
    })
  })
})
