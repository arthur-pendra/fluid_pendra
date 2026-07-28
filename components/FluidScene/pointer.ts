import type { Vec2 } from './types'

/**
 * Cursorstand, bijgehouden buiten React om: deze waarden veranderen elk frame
 * en mogen geen renders veroorzaken.
 */
export type PointerState = {
  /** cursor in uv-ruimte, of null als de cursor buiten het component staat */
  uv: Vec2 | null
  /** waar de laatste klik viel */
  clickUv: Vec2 | null
  /** tijdstip van die klik, waaraan de rig ziet dat er een nieuwe is */
  clickedAt: number | null
  /** wanneer de cursor voor het laatst een nieuw doel mocht aanwijzen */
  lastTargetAt: number
}

export const createPointerState = (): PointerState => ({
  uv: null,
  clickUv: null,
  clickedAt: null,
  lastTargetAt: 0,
})

/**
 * Schermpositie naar uv binnen een element. De y-as klapt om: in uv wijst
 * hij omhoog, in de DOM omlaag.
 */
export const eventToUv = (
  event: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
): Vec2 => ({
  x: (event.clientX - rect.left) / Math.max(rect.width, 1),
  y: 1 - (event.clientY - rect.top) / Math.max(rect.height, 1),
})
