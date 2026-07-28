'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFBO, useTexture } from '@react-three/drei'
import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Vector2,
  type Texture,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from 'three'
import { fullscreenVertexShader } from './shaders/fullscreen'
import { advectionFragmentShader } from './shaders/advection'
import { externalForceFragmentShader } from './shaders/externalForce'
import {
  divergenceFragmentShader,
  gradientSubtractFragmentShader,
  pressureFragmentShader,
} from './shaders/projection'
import { accumulationFragmentShader } from './shaders/accumulation'
import type { SimulationConfig, Vec2 } from './types'

/**
 * Eén penseel dat kracht in het veld zet. De vorm is een capsule tussen de
 * vorige en de huidige positie, met aan beide uiteinden een eigen straal.
 */
export type Brush = {
  center: Vector2
  lastCenter: Vector2
  force: Vector2
  scale: number
  lastScale: number
  intensity: number
  /** verstreken tijd sinds de klik, of 0 als er geen golf loopt */
  circular: number
}

const createBrush = (): Brush => ({
  center: new Vector2(0.5, 0.5),
  lastCenter: new Vector2(0.5, 0.5),
  force: new Vector2(),
  scale: 0.1,
  lastScale: 0.1,
  intensity: 0,
  circular: 0,
})

/** een paar buffers dat om beurten gelezen en geschreven wordt */
const createPair = (a: WebGLRenderTarget, b: WebGLRenderTarget) => {
  const state = { read: a, write: b }
  return {
    get read() {
      return state.read
    },
    get write() {
      return state.write
    },
    swap() {
      const previous = state.read
      state.read = state.write
      state.write = previous
    },
  }
}

/**
 * De vloeistofoplosser. Zes passes per frame:
 *
 *   1. penselen zetten kracht en intensiteit in het veld
 *   2. advectie sleept het veld mee, met ruis die de stroming stuurt
 *   3. divergentie meet waar het veld uit elkaar loopt
 *   4. druk lost dat op met een paar Jacobi-iteraties
 *   5. de drukgradiënt gaat er weer af, en wat overblijft wervelt
 *   6. accumulatie onthoudt waar de stroming geweest is
 *
 * De oplosser draait op een vaste tijdstap, niet op de framedelta. Dat is
 * bewust: een vloeistof die met de framerate meeschommelt oogt onrustig.
 */
export const useFluidSimulation = (config: SimulationConfig, brushCount: number) => {
  const size = config.resolution

  const noise = useTexture('/noise-fractal.png')

  useEffect(() => {
    noise.wrapS = RepeatWrapping
    noise.wrapT = RepeatWrapping
    noise.needsUpdate = true
  }, [noise])

  const settings = useMemo(
    () => ({
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  )

  const velocityA = useFBO(size, size, settings)
  const velocityB = useFBO(size, size, settings)
  const divergenceTarget = useFBO(size, size, settings)
  const pressureA = useFBO(size, size, settings)
  const pressureB = useFBO(size, size, settings)
  const accumulationA = useFBO(size, size, settings)
  const accumulationB = useFBO(size, size, settings)

  const velocity = useMemo(() => createPair(velocityA, velocityB), [velocityA, velocityB])
  const pressure = useMemo(() => createPair(pressureA, pressureB), [pressureA, pressureB])
  const accumulation = useMemo(
    () => createPair(accumulationA, accumulationB),
    [accumulationA, accumulationB],
  )

  const brushes = useMemo(() => Array.from({ length: brushCount }, createBrush), [brushCount])

  const texel = useMemo(() => new Vector2(1 / size, 1 / size), [size])

  const materials = useMemo(() => {
    const shared = { vertexShader: fullscreenVertexShader, depthTest: false, depthWrite: false }

    return {
      /* vult een buffer met nullen; een verse half-float buffer bevat rommel
         die anders als NaN door de hele simulatie trekt */
      clear: new ShaderMaterial({
        ...shared,
        fragmentShader: `void main() { gl_FragColor = vec4(0.0); }`,
      }),

      externalForce: new ShaderMaterial({
        ...shared,
        defines: { NB_INPUTS: brushCount },
        fragmentShader: externalForceFragmentShader,
        uniforms: {
          uPrevious: { value: null },
          uForce: { value: brushes.map((brush) => brush.force) },
          uCenter: { value: brushes.map((brush) => brush.center) },
          uLastCenter: { value: brushes.map((brush) => brush.lastCenter) },
          uScale: { value: brushes.map((brush) => brush.scale) },
          uLastScale: { value: brushes.map((brush) => brush.lastScale) },
          uIntensity: { value: brushes.map((brush) => brush.intensity) },
          uCircular: { value: brushes.map((brush) => brush.circular) },
        },
      }),

      advection: new ShaderMaterial({
        ...shared,
        fragmentShader: advectionFragmentShader,
        uniforms: {
          uVelocity: { value: null },
          uNoise: { value: null },
          uDelta: { value: config.timeStep },
          uDeceleration: { value: config.deceleration },
          uRandomDirection: { value: config.randomDirection },
          uFirstNoiseScale: { value: config.firstNoiseScale },
          uSecondNoiseScale: { value: config.secondNoiseScale },
          uVelocityThreshold: { value: config.velocityThreshold },
          uGapVelocityBoost: { value: config.gapVelocityBoost },
          uGapAmount: { value: new Vector2(config.gapAmount.min, config.gapAmount.max) },
        },
      }),

      divergence: new ShaderMaterial({
        ...shared,
        fragmentShader: divergenceFragmentShader,
        uniforms: {
          uVelocity: { value: null },
          uTexel: { value: texel },
          uDelta: { value: config.timeStep },
        },
      }),

      pressure: new ShaderMaterial({
        ...shared,
        fragmentShader: pressureFragmentShader,
        uniforms: {
          uPressure: { value: null },
          uDivergence: { value: null },
          uTexel: { value: texel },
        },
      }),

      gradientSubtract: new ShaderMaterial({
        ...shared,
        fragmentShader: gradientSubtractFragmentShader,
        uniforms: {
          uPressure: { value: null },
          uVelocity: { value: null },
          uTexel: { value: texel },
          uDelta: { value: config.timeStep },
        },
      }),

      accumulation: new ShaderMaterial({
        ...shared,
        fragmentShader: accumulationFragmentShader,
        uniforms: {
          uVelocity: { value: null },
          uAccumulation: { value: null },
          uAttenuation: { value: config.attenuation },
          uDrift: { value: new Vector2() },
        },
      }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brushCount, brushes, texel])

  const pass = useMemo(() => {
    const scene = new Scene()
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const mesh = new Mesh(new PlaneGeometry(2, 2), materials.clear)
    mesh.frustumCulled = false
    scene.add(mesh)
    return { scene, camera, mesh }
  }, [materials])

  const primed = useRef(false)

  const run = (renderer: WebGLRenderer, material: ShaderMaterial, target: WebGLRenderTarget) => {
    pass.mesh.material = material
    renderer.setRenderTarget(target)
    renderer.render(pass.scene, pass.camera)
    renderer.setRenderTarget(null)
  }

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose())
      pass.mesh.geometry.dispose()
    },
    [materials, pass],
  )

  /**
   * `drift` is de verschuiving van de nagloed voor deze stap, in uv van de
   * buffer. De aanroeper rekent hem uit, want die kent de beeldverhouding en de
   * windrichting; hier is het alleen nog een vector.
   */
  const step = (renderer: WebGLRenderer, drift: Vec2 = { x: 0, y: 0 }) => {
    const { uniforms: force } = materials.externalForce
    const { uniforms: advect } = materials.advection
    const { uniforms: divergence } = materials.divergence
    const { uniforms: jacobi } = materials.pressure
    const { uniforms: subtract } = materials.gradientSubtract
    const { uniforms: accumulate } = materials.accumulation

    if (!primed.current) {
      primed.current = true
      for (const target of [
        velocityA,
        velocityB,
        divergenceTarget,
        pressureA,
        pressureB,
        accumulationA,
        accumulationB,
      ]) {
        run(renderer, materials.clear, target)
      }
    }

    /* de getalsmatige uniforms staan in aparte arrays en moeten per frame
       opnieuw; de vectoren delen hun object met de penselen en gaan vanzelf */
    force.uScale.value = brushes.map((brush) => brush.scale)
    force.uLastScale.value = brushes.map((brush) => brush.lastScale)
    force.uIntensity.value = brushes.map((brush) => brush.intensity)
    force.uCircular.value = brushes.map((brush) => brush.circular)

    advect.uNoise.value = noise
    advect.uDelta.value = config.timeStep
    advect.uDeceleration.value = config.deceleration
    advect.uRandomDirection.value = config.randomDirection
    advect.uVelocityThreshold.value = config.velocityThreshold
    advect.uGapVelocityBoost.value = config.gapVelocityBoost
    advect.uGapAmount.value.set(config.gapAmount.min, config.gapAmount.max)
    divergence.uDelta.value = config.timeStep
    subtract.uDelta.value = config.timeStep
    accumulate.uAttenuation.value = config.attenuation
    accumulate.uDrift.value.set(drift.x, drift.y)

    /* 1. penselen */
    force.uPrevious.value = velocity.read.texture
    run(renderer, materials.externalForce, velocity.write)
    velocity.swap()

    /* 2. advectie */
    advect.uVelocity.value = velocity.read.texture
    run(renderer, materials.advection, velocity.write)
    velocity.swap()

    /* 3. divergentie */
    divergence.uVelocity.value = velocity.read.texture
    run(renderer, materials.divergence, divergenceTarget)

    /* 4. druk */
    jacobi.uDivergence.value = divergenceTarget.texture
    for (let iteration = 0; iteration < config.pressureIterations; iteration++) {
      jacobi.uPressure.value = pressure.read.texture
      run(renderer, materials.pressure, pressure.write)
      pressure.swap()
    }

    /* 5. drukgradiënt eraf */
    subtract.uVelocity.value = velocity.read.texture
    subtract.uPressure.value = pressure.read.texture
    run(renderer, materials.gradientSubtract, velocity.write)
    velocity.swap()

    /* 6. nagloed */
    accumulate.uVelocity.value = velocity.read.texture
    accumulate.uAccumulation.value = accumulation.read.texture
    run(renderer, materials.accumulation, accumulation.write)
    accumulation.swap()
  }

  return {
    brushes,
    step,
    /* de eindpass leest dezelfde ruis voor zijn luchtslierten */
    noise,
    get texture(): Texture {
      return accumulation.read.texture
    },
  }
}
