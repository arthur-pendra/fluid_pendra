'use client'

import { Suspense, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import FluidRig from './FluidRig'
import { defaultConfig } from './config'
import { createPointerState, eventToUv, type PointerState } from './pointer'
import { applyProfile, deviceHints, dprCeiling, readProfile } from './profile'
import type { FluidSceneProps } from './types'
import styles from './FluidScene.module.css'

/**
 * Vloeistofscene met een vervangbaar 3D-object.
 *
 * Het component vult zijn ouder volledig, dus geef die een hoogte. Het luistert
 * alleen op zijn eigen element, kaapt de scroll niet en zet niets op window.
 *
 *   <FluidScene className={styles.scene} modelUrl="/models/mijn-model.glb" />
 *
 * Alle knoppen staan in config.ts.
 */
const hasWebgl = () => {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

const FluidScene = ({
  modelUrl,
  className,
  paused = false,
  config = defaultConfig,
}: FluidSceneProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<PointerState>(createPointerState())
  const [supported] = useState(hasWebgl)

  /* Eén keer bij het opstarten: is dit een apparaat dat de volle scene trekt?
     Zie profile.ts. Niet meelezen bij resize — een venster dat smaller wordt
     maakt de machine niet trager, en midden in het beeld van simulatiegrootte
     wisselen zou de hele vloeistof wissen. */
  const [profile] = useState(() => (typeof window === 'undefined' ? 'vol' : readProfile(deviceHints())))
  const tuned = useMemo(() => applyProfile(config, profile), [config, profile])

  const readUv = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    return rect ? eventToUv(event, rect) : null
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointer.current.uv = readUv(event)
  }

  const handlePointerLeave = () => {
    pointer.current.uv = null
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const uv = readUv(event)
    if (!uv) return

    /* de plek onthouden blijft altijd zinnig: op een aanraakscherm is een tik
       de enige manier waarop de scene te weten komt waar je zit */
    pointer.current.uv = uv

    if (!config.clickImpulse) return
    pointer.current.clickUv = uv
    pointer.current.clickedAt = performance.now()
  }

  const classNames = [styles.root, className].filter(Boolean).join(' ')

  /* geen WebGL: stil terugvallen op de achtergrondkleur, geen foutscherm */
  if (!supported) {
    return (
      <div className={classNames}>
        <div className={styles.fallback} style={{ backgroundColor: config.background }} />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={classNames}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
    >
      <Canvas
        dpr={[1, dprCeiling(profile)]}
        gl={{ antialias: false, alpha: false }}
        camera={{ position: [0, 0, 1] }}
      >
        {/* de advectie leest een ruistextuur, en die laadt via suspense */}
        <Suspense fallback={null}>
          <FluidRig config={tuned} modelUrl={modelUrl} paused={paused} pointer={pointer} />
        </Suspense>
      </Canvas>
    </div>
  )
}

export default FluidScene
