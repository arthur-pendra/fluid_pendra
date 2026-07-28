'use client'

import { Component, Suspense, forwardRef, useMemo, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Mesh, MeshBasicMaterial, Vector3, type Group, type Object3D } from 'three'
import type { ObjectConfig } from './types'

/**
 * Het object dat in de render target zweeft. De scene heeft geen lichtbronnen,
 * dus alles krijgt een unlit materiaal: een model met een gewoon PBR-materiaal
 * zou anders zwart blijven.
 *
 * Elk model wordt automatisch gecentreerd en op zijn langste as naar
 * `config.length` geschaald, zodat je je eigen glb erin kunt zetten zonder
 * ergens een getal aan te passen.
 */

const fitToLength = (object: Object3D, length: number) => {
  const box = new Box3().setFromObject(object)
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  const longest = Math.max(size.x, size.y, size.z)

  object.position.sub(center)
  if (longest > 0) object.scale.setScalar(length / longest)
}

const makeUnlit = (object: Object3D, color: string) => {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return
    const previous = Array.isArray(child.material) ? child.material[0] : child.material
    child.material = new MeshBasicMaterial({
      color: previous?.map ? '#ffffff' : color,
      map: previous?.map ?? null,
    })
  })
}

const Sphere = ({ config }: { config: ObjectConfig }) => (
  <mesh>
    <sphereGeometry args={[config.length / 2, 48, 32]} />
    <meshBasicMaterial color={config.color} />
  </mesh>
)

const Model = ({ url, config }: { url: string; config: ObjectConfig }) => {
  const { scene } = useGLTF(url)
  const prepared = useMemo(() => {
    const clone = scene.clone(true)
    makeUnlit(clone, config.color)
    fitToLength(clone, config.length)
    return clone
  }, [scene, config.color, config.length])

  return <primitive object={prepared} />
}

/** een model dat niet laadt mag de scene niet meeslepen */
class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[FluidScene] model kon niet geladen worden, terug naar de bol', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

type FloatingObjectProps = {
  config: ObjectConfig
  modelUrl?: string
}

const FloatingObject = forwardRef<Group, FloatingObjectProps>(({ config, modelUrl }, ref) => {
  const fallback = <Sphere config={config} />

  return (
    <group ref={ref}>
      {modelUrl ? (
        <ModelBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <Model url={modelUrl} config={config} />
          </Suspense>
        </ModelBoundary>
      ) : (
        fallback
      )}
    </group>
  )
})

FloatingObject.displayName = 'FloatingObject'

export default FloatingObject
