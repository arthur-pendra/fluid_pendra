import type { Vec2 } from './types'

/**
 * Rekenwerk tussen schermruimte, uv-ruimte en het vlak waarop het object
 * zweeft. Pure functies, los te testen, geen three.js nodig.
 *
 * De camera staat recht boven de scene en kijkt naar beneden, met -z als
 * beeldrichting omhoog. Daardoor is de afbeelding van het vlak naar het scherm
 * een simpele lineaire schaling.
 */

export const ndcToUv = (x: number, y: number): Vec2 => ({
  x: x * 0.5 + 0.5,
  y: y * 0.5 + 0.5,
})

/** halve afmetingen van het zichtbare vlak op de gegeven afstand */
export const planeHalfSize = (fovDegrees: number, distance: number, aspect: number) => {
  const halfHeight = Math.tan((fovDegrees * Math.PI) / 360) * distance
  return { halfWidth: halfHeight * aspect, halfHeight }
}

/** cursorpositie in uv naar een punt op het vlak waar het object zweeft */
export const uvToPlane = (uv: Vec2, halfWidth: number, halfHeight: number): Vec2 => ({
  x: (uv.x * 2 - 1) * halfWidth,
  y: -(uv.y * 2 - 1) * halfHeight,
})

/**
 * Schermruimte naar de ruimte van de simulatie.
 *
 * De simulatie is vierkant en het scherm niet. De eindpass leest de buffer met
 * deze correctie rond het midden, dus de penselen moeten er op precies
 * dezelfde manier in gezet worden. Doe je dat niet, dan staat je spoor ergens
 * anders dan je cursor en valt het bij een breed scherm grotendeels buiten het
 * gelezen gebied.
 *
 * De y-as klapt om: in schermruimte wijst hij omhoog, in de buffer omlaag.
 */
export const screenToSimulationUv = (uv: Vec2, ratio: number): Vec2 => {
  let x = uv.x - 0.5
  let y = 1 - uv.y - 0.5

  if (ratio > 1) {
    y /= ratio
  } else {
    x *= ratio
  }

  return { x: x + 0.5, y: y + 0.5 }
}

/**
 * Dezelfde afbeelding, maar dan voor een richting in plaats van een plek: het
 * verschuiven naar het midden valt weg, het omklappen en het samenpersen niet.
 *
 * Een richting die je op het scherm uitmeet en daarna met de snelheid van een
 * penseel wil vergelijken moet hier doorheen. Doe je dat niet, dan wijst je as
 * op een breed scherm de verkeerde kant op zodra hij niet toevallig langs een
 * van beide assen ligt. De uitkomst is niet genormaliseerd.
 */
export const screenToSimulationDirection = (direction: Vec2, ratio: number): Vec2 =>
  ratio > 1
    ? { x: direction.x, y: -direction.y / ratio }
    : { x: direction.x * ratio, y: -direction.y }

/** afstand waarop de camera moet staan om een vlak van deze hoogte te vullen */
export const distanceForHeight = (fovDegrees: number, height: number) =>
  height / 2 / Math.tan((fovDegrees * Math.PI) / 360)
