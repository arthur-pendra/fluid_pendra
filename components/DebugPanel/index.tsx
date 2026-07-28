'use client'

import { useEffect } from 'react'
import { useControls, folder } from 'leva'
import { defaultConfig } from '@/components/FluidScene/config'
import type { FluidSceneConfig } from '@/components/FluidScene/types'

/**
 * Afstelpaneel voor tijdens het ontwikkelen. Het staat bewust buiten de
 * FluidScene-map: die map blijft daardoor vrij van leva, en het paneel komt
 * niet in de productiebundel terecht omdat de pagina het alleen dynamisch
 * inlaadt wanneer NODE_ENV op development staat.
 *
 * Waarden die je hier vindt zet je daarna in FluidScene/config.ts. Let op bij
 * de oplosser: die waarden komen uit het origineel en hangen samen. Draai er
 * gerust aan, maar een paar ervan kantelen het karakter volledig.
 */
type DebugPanelProps = {
  value: FluidSceneConfig
  onChange: (config: FluidSceneConfig) => void
}

const { object, simulation, painting } = defaultConfig

const DebugPanel = ({ onChange }: DebugPanelProps) => {
  const controls = useControls({
    background: defaultConfig.background,

    object: folder(
      {
        color: object.color,
        length: { value: object.length, min: 0.1, max: 3, step: 0.01 },
        followSpeed: { value: object.followSpeed, min: 0, max: 12, step: 0.1 },
        driftRadius: { value: object.driftRadius, min: 0, max: 1.5, step: 0.01 },
        driftSpeed: { value: object.driftSpeed, min: 0, max: 2, step: 0.01 },
      },
      { collapsed: false },
    ),

    stroming: folder(
      {
        cursorForce: { value: simulation.cursorForce, min: 0, max: 300, step: 1 },
        objectForce: { value: simulation.objectForce, min: 0, max: 600, step: 1 },
        brushSize: { value: simulation.brushSize, min: 0.01, max: 0.5, step: 0.005 },
        deceleration: { value: simulation.deceleration, min: 0.8, max: 1, step: 0.001 },
        attenuation: { value: simulation.attenuation, min: 0.9, max: 1, step: 0.0005 },
        randomDirection: { value: simulation.randomDirection, min: 0, max: 1, step: 0.01 },
        velocityThreshold: { value: simulation.velocityThreshold, min: 0, max: 1, step: 0.001 },
        timeStep: { value: simulation.timeStep, min: 0.001, max: 0.05, step: 0.001 },
      },
      { collapsed: true },
    ),

    beeld: folder(
      {
        warp: { value: painting.warp, min: 0, max: 0.05, step: 0.0005 },
        rippleStrength: { value: painting.rippleStrength, min: 0, max: 0.2, step: 0.001 },
        tintAmount: { value: painting.tintAmount, min: 0, max: 0.3, step: 0.005 },
      },
      { collapsed: true },
    ),
  })

  useEffect(() => {
    onChange({
      ...defaultConfig,
      background: controls.background,
      object: {
        ...object,
        color: controls.color,
        length: controls.length,
        followSpeed: controls.followSpeed,
        driftRadius: controls.driftRadius,
        driftSpeed: controls.driftSpeed,
      },
      simulation: {
        ...simulation,
        cursorForce: controls.cursorForce,
        objectForce: controls.objectForce,
        brushSize: controls.brushSize,
        deceleration: controls.deceleration,
        attenuation: controls.attenuation,
        randomDirection: controls.randomDirection,
        velocityThreshold: controls.velocityThreshold,
        timeStep: controls.timeStep,
      },
      painting: {
        ...painting,
        warp: controls.warp,
        rippleStrength: controls.rippleStrength,
        tintAmount: controls.tintAmount,
      },
    })
  }, [controls, onChange])

  return null
}

export default DebugPanel
