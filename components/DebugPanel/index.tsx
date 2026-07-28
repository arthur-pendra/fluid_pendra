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
    clickImpulse: defaultConfig.clickImpulse,

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

    leven: folder(
      {
        tailSway: { value: object.tailSway, min: 0, max: 0.25, step: 0.005 },
        tailRate: { value: object.tailRate, min: 0, max: 6, step: 0.05 },
        tailWave: { value: object.tailWave, min: 0, max: 10, step: 0.1 },
        neckFollow: { value: object.neckFollow, min: 0, max: 2, step: 0.01 },
        neckRate: { value: object.neckRate, min: 0.1, max: 12, step: 0.1 },
        soarLift: { value: object.soarLift, min: 0, max: 0.4, step: 0.005 },
        diveEvery: { value: object.diveEvery, min: 0, max: 60, step: 1 },
        diveAcceleration: { value: object.diveAcceleration, min: 0.2, max: 12, step: 0.1 },
        pitchTime: { value: object.pitchTime, min: 0.2, max: 4, step: 0.05 },
        awayTime: { value: object.awayTime, min: 0, max: 8, step: 0.1 },
        enterRate: { value: object.enterRate, min: 0.2, max: 4, step: 0.1 },
        soarRate: { value: object.soarRate, min: 0.05, max: 2, step: 0.01 },
      },
      { collapsed: false },
    ),

    volgen: folder(
      {
        reachSide: { value: object.reachSide, min: 0, max: 1, step: 0.01 },
        followRate: { value: object.followRate, min: 0.1, max: 8, step: 0.05 },
        driftAhead: { value: object.driftAhead, min: 0, max: 0.5, step: 0.01 },
        driftRate: { value: object.driftRate, min: 0.01, max: 0.3, step: 0.005 },
        reachAhead: { value: object.reachAhead, min: 0, max: 1, step: 0.01 },
        beatThrust: { value: object.beatThrust, min: 0, max: 4, step: 0.05 },
        glideBack: { value: object.glideBack, min: 0, max: 1.5, step: 0.01 },
        beatRate: { value: object.beatRate, min: 0.2, max: 8, step: 0.1 },
        soarBrake: { value: object.soarBrake, min: 0.02, max: 0.9, step: 0.01 },
        bankAngle: { value: object.bankAngle, min: 0, max: 45, step: 0.5 },
        bankRate: { value: object.bankRate, min: 0.2, max: 8, step: 0.1 },
        glideHold: { value: object.glideHold, min: 0, max: 2.5, step: 0.05 },
        thrustResponse: { value: object.thrustResponse, min: 0.5, max: 30, step: 0.5 },
      },
      { collapsed: false },
    ),

    stroming: folder(
      {
        cursorForce: { value: simulation.cursorForce, min: 0, max: 300, step: 1 },
        objectForce: { value: simulation.objectForce, min: 0, max: 600, step: 1 },
        windDirection: { value: simulation.windDirection, min: 0, max: 360, step: 1 },
        windSpeed: { value: simulation.windSpeed, min: 0, max: 0.6, step: 0.01 },
        strokeBias: { value: simulation.strokeBias, min: 0, max: 1, step: 0.01 },
        strokeSteering: { value: simulation.strokeSteering, min: 0, max: 1, step: 0.01 },
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
        wispAmount: { value: painting.wispAmount, min: 0, max: 0.6, step: 0.01 },
        wispColor: painting.wispColor,
        wispScale: { value: painting.wispScale, min: 0.2, max: 4, step: 0.1 },
        wispGap: { value: painting.wispGap, min: 0, max: 0.95, step: 0.01 },
        wispSpeed: { value: painting.wispSpeed, min: 0, max: 0.8, step: 0.01 },
        wispWarp: { value: painting.wispWarp, min: 0, max: 1.5, step: 0.01 },
        wispClear: { value: painting.wispClear, min: 0, max: 3, step: 0.05 },
      },
      { collapsed: true },
    ),
  })

  useEffect(() => {
    onChange({
      ...defaultConfig,
      background: controls.background,
      clickImpulse: controls.clickImpulse,
      object: {
        ...object,
        color: controls.color,
        length: controls.length,
        followSpeed: controls.followSpeed,
        driftRadius: controls.driftRadius,
        driftSpeed: controls.driftSpeed,
        reachSide: controls.reachSide,
        followRate: controls.followRate,
        driftAhead: controls.driftAhead,
        driftRate: controls.driftRate,
        reachAhead: controls.reachAhead,
        beatThrust: controls.beatThrust,
        glideBack: controls.glideBack,
        beatRate: controls.beatRate,
        soarBrake: controls.soarBrake,
        bankAngle: controls.bankAngle,
        bankRate: controls.bankRate,
        glideHold: controls.glideHold,
        thrustResponse: controls.thrustResponse,
        tailSway: controls.tailSway,
        tailRate: controls.tailRate,
        tailWave: controls.tailWave,
        neckFollow: controls.neckFollow,
        neckRate: controls.neckRate,
        soarLift: controls.soarLift,
        soarRate: controls.soarRate,
        diveEvery: controls.diveEvery,
        diveAcceleration: controls.diveAcceleration,
        pitchTime: controls.pitchTime,
        awayTime: controls.awayTime,
        enterRate: controls.enterRate,
      },
      simulation: {
        ...simulation,
        cursorForce: controls.cursorForce,
        objectForce: controls.objectForce,
        windDirection: controls.windDirection,
        windSpeed: controls.windSpeed,
        strokeBias: controls.strokeBias,
        strokeSteering: controls.strokeSteering,
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
        wispAmount: controls.wispAmount,
        wispColor: controls.wispColor,
        wispScale: controls.wispScale,
        wispGap: controls.wispGap,
        wispSpeed: controls.wispSpeed,
        wispWarp: controls.wispWarp,
        wispClear: controls.wispClear,
      },
    })
  }, [controls, onChange])

  return null
}

export default DebugPanel
