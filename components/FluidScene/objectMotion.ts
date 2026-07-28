import type { ObjectConfig, Vec2 } from './types'

/**
 * Het gedrag van het zwevende object, als pure functies zodat het los te
 * testen is en geen three.js nodig heeft.
 *
 * Het object beweegt over het xz-vlak: `position` is de plek waar het naartoe
 * kruipt, `visible` is die plek plus de continue drift. Die drift is niet
 * decoratief: het object is alleen zichtbaar waar de vloeistof beweegt, dus
 * een object dat helemaal stilvalt verdwijnt uit beeld.
 */
export type MotionState = {
  /** waar het object naartoe kruipt */
  position: Vec2
  /** het doel dat cursor of klik heeft aangewezen */
  target: Vec2
  /** positie inclusief drift; dit is wat je ziet */
  visible: Vec2
  /** de vorige zichtbare positie, voor de bewegingsrichting */
  previous: Vec2
  /** gedempte bewegingsrichting, bepaalt hoe de roerpunten liggen */
  direction: Vec2
  /** verstreken tijd, voedt de drift */
  elapsed: number
}

export const createMotionState = (start: Vec2 = { x: 0, y: 0 }): MotionState => ({
  position: { ...start },
  target: { ...start },
  visible: { ...start },
  previous: { ...start },
  direction: { x: 0, y: 1 },
  elapsed: 0,
})

const length2 = (x: number, y: number) => Math.sqrt(x * x + y * y)

export const stepMotion = (
  state: MotionState,
  config: Pick<ObjectConfig, 'followSpeed' | 'driftRadius' | 'driftSpeed'>,
  delta: number,
): MotionState => {
  const elapsed = state.elapsed + delta

  /* naar het doel kruipen, met een snelheidsplafond */
  const dx = state.target.x - state.position.x
  const dy = state.target.y - state.position.y
  const distance = length2(dx, dy)
  const position = { ...state.position }
  if (distance > 1e-5) {
    const step = Math.min(distance, config.followSpeed * delta)
    position.x += (dx / distance) * step
    position.y += (dy / distance) * step
  }

  /* drift eromheen, zodat er altijd beweging in de vloeistof blijft */
  const angle = elapsed * config.driftSpeed
  const visible = {
    x: position.x + Math.cos(angle) * config.driftRadius,
    y: position.y + Math.sin(angle * 0.8) * config.driftRadius,
  }

  /* richting dempen, anders klappert de lijn met roerpunten */
  const vx = visible.x - state.visible.x
  const vy = visible.y - state.visible.y
  const speed = length2(vx, vy)
  const direction = { ...state.direction }
  if (speed > 1e-6) {
    direction.x += (vx / speed - direction.x) * 0.1
    direction.y += (vy / speed - direction.y) * 0.1
    const normal = length2(direction.x, direction.y)
    if (normal > 1e-6) {
      direction.x /= normal
      direction.y /= normal
    }
  }

  return {
    position,
    target: state.target,
    visible,
    previous: state.visible,
    direction,
    elapsed,
  }
}

/**
 * De punten waarlangs het object de vloeistof beroert: een lijn door het
 * object heen, gecentreerd op zijn positie en gericht op zijn beweging. De
 * lengte van die lijn bepaalt hoe groot de veeg in de verflaag wordt.
 */
export const stirPoints = (state: MotionState, count: number, length: number): Vec2[] => {
  const points: Vec2[] = []
  const half = length / 2
  const spacing = count > 1 ? length / (count - 1) : 0
  for (let i = 0; i < count; i++) {
    const offset = half - i * spacing
    points.push({
      x: state.visible.x + state.direction.x * offset,
      y: state.visible.y + state.direction.y * offset,
    })
  }
  return points
}
