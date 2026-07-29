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
    /* de draak kaal, zonder vloeistof eromheen — om aan zijn belichting te zitten */
    bareObject: defaultConfig.bareObject,
    /* uit laat hem doorvliegen als je van de muis af gaat, in plaats van wegduiken */
    diveEnabled: defaultConfig.diveEnabled,

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
        lookGive: { value: object.lookGive, min: 0.2, max: 3.1, step: 0.05 },
        gazeSweep: { value: object.gazeSweep, min: 0, max: 0.8, step: 0.01 },
        gazeRate: { value: object.gazeRate, min: 0.02, max: 1, step: 0.01 },
        soarLift: { value: object.soarLift, min: 0, max: 0.4, step: 0.005 },
        idleAfter: { value: object.idleAfter, min: 0.5, max: 15, step: 0.1 },
        diveEvery: { value: object.diveEvery, min: 0, max: 60, step: 1 },
        diveAcceleration: { value: object.diveAcceleration, min: 0.2, max: 12, step: 0.1 },
        pitchTime: { value: object.pitchTime, min: 0.2, max: 4, step: 0.05 },
        awayTime: { value: object.awayTime, min: 0, max: 8, step: 0.1 },
        enterRate: { value: object.enterRate, min: 0.2, max: 4, step: 0.1 },
        soarRate: { value: object.soarRate, min: 0.05, max: 2, step: 0.01 },
      },
      { collapsed: false },
    ),

    belichting: folder(
      {
        /* De ramp schaalt zichzelf, dus deze zes veranderen zijn vórm en niet
           hoe licht hij is. Ruime bereiken met opzet: het gaat erom dat je kunt
           zien wat een knop dóét, niet dat elke stand bruikbaar is. */
        matcapBase: { value: object.matcapBase, min: 0, max: 1, step: 0.01 },
        matcapSweep: { value: object.matcapSweep, min: 0.1, max: 8, step: 0.05 },
        matcapGloss: { value: object.matcapGloss, min: 0, max: 4, step: 0.05 },
        matcapGlossWidth: { value: object.matcapGlossWidth, min: 1, max: 60, step: 0.5 },
        matcapRim: { value: object.matcapRim, min: 0, max: 4, step: 0.05 },
        matcapRimGap: { value: object.matcapRimGap, min: 0, max: 2, step: 0.02 },
        /* de kleur van de ramp zelf; zet ze op zwart/wit/wit voor het grijze
           recept van de vis */
        shadowTint: object.shadowTint,
        lightTint: object.lightTint,
        rimTint: object.rimTint,
        iridescence: { value: object.iridescence, min: 0, max: 1, step: 0.01 },
        iridescenceSpread: { value: object.iridescenceSpread, min: 0.2, max: 6, step: 0.1 },
        lightAngle: { value: object.lightAngle, min: 0, max: 360, step: 1 },
        lightHeight: { value: object.lightHeight, min: 0, max: 1, step: 0.01 },
        /* en deze drie hoe licht hij wordt; die staan achter de textuur */
        lightPunch: { value: object.lightPunch, min: 0, max: 4, step: 0.05 },
        ambient: { value: object.ambient, min: 0, max: 3, step: 0.05 },
        shadeFloor: { value: object.shadeFloor, min: 0, max: 2, step: 0.02 },
      },
      { collapsed: true },
    ),
    volgen: folder(
      {
        reachSide: { value: object.reachSide, min: 0, max: 1, step: 0.01 },
        releaseRate: { value: object.releaseRate, min: 0, max: 2, step: 0.02 },
        trailRate: { value: object.trailRate, min: 0.2, max: 12, step: 0.1 },
        orbitRadius: { value: object.orbitRadius, min: 0, max: 1.2, step: 0.01 },
        orbitRate: { value: object.orbitRate, min: 0, max: 0.4, step: 0.005 },
        followRate: { value: object.followRate, min: 0.1, max: 8, step: 0.05 },
        driftAhead: { value: object.driftAhead, min: 0, max: 0.5, step: 0.01 },
        driftRate: { value: object.driftRate, min: 0.01, max: 0.3, step: 0.005 },
        reachAhead: { value: object.reachAhead, min: 0, max: 1, step: 0.01 },
        beatThrust: { value: object.beatThrust, min: 0, max: 4, step: 0.05 },
        glideBack: { value: object.glideBack, min: 0, max: 1.5, step: 0.01 },
        beatRate: { value: object.beatRate, min: 0.2, max: 8, step: 0.1 },
        soarBrake: { value: object.soarBrake, min: 0.02, max: 0.9, step: 0.01 },
        bankAngle: { value: object.bankAngle, min: 0, max: 45, step: 0.5 },
        rollAngle: { value: object.rollAngle, min: 0, max: 60, step: 0.5 },
        rollRate: { value: object.rollRate, min: 0.2, max: 10, step: 0.1 },
        leanAngle: { value: object.leanAngle, min: 0, max: 30, step: 0.5 },
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

    waas: folder(
      {
        /* De mist op de scene van de draak zelf, niet op de eindpass. Die zit
           binnen zijn render target en blijft dus ook staan met `bareObject`
           aan — het is de enige laag die je op geen enkele manier kwijtraakt. */
        fogDepth: { value: object.fogDepth, min: 0.2, max: 8, step: 0.05 },
        /* En waar de vloeistof zijn rokerige karakter vandaan haalt: twee
           ruistexturen over elkaar die de stroming sturen. De tweede is fijner
           dan de eerste; hoe verder ze uit elkaar staan, hoe meer detail er in
           de wervels komt. */
        firstNoiseScale: { value: simulation.firstNoiseScale, min: 0.2, max: 6, step: 0.05 },
        secondNoiseScale: { value: simulation.secondNoiseScale, min: 0.2, max: 12, step: 0.1 },
        /* onder de drempel valt de stroming in gaten uiteen; dat is wat er
           vlokken van maakt in plaats van een gladde veeg */
        gapVelocityBoost: { value: simulation.gapVelocityBoost, min: 0, max: 10, step: 0.1 },
      },
      { collapsed: true },
    ),

    beeld: folder(
      {
        /* hoeveel van de draak er sowieso doorkomt, los van de stroming; op 0 is
           het zoals het was en zie je hem alleen waar je geveegd hebt */
        presence: { value: painting.presence, min: 0, max: 1, step: 0.01 },
        /* en hoe die aanwezigheid opgebroken wordt; op 0 is hij matglas, hoger
           maakt er wolken van met randen eraan */
        presenceHoles: { value: painting.presenceHoles, min: 0, max: 1, step: 0.02 },
        presenceScale: { value: painting.presenceScale, min: 0.1, max: 3, step: 0.05 },
        presenceDrift: { value: painting.presenceDrift, min: 0, max: 0.4, step: 0.005 },
        warp: { value: painting.warp, min: 0, max: 0.05, step: 0.0005 },
        rippleStrength: { value: painting.rippleStrength, min: 0, max: 0.2, step: 0.001 },
        /* De tint die over de draak heen gaat, en de enige laag naast de
           slierten waar je iets aan kunt doen — het masker eronder is de
           vloeistof zelf en heeft geen knop.

           De drie eronder zijn de vorm van het kleurverloop: kleur = basis +
           amplitude * cos(2pi * (frequentie * t + fase)). Basis is het midden
           waar hij omheen slingert, amplitude hoe ver, frequentie hoe vaak hij
           de cirkel rondgaat over de streek. Gelijke waarden per kanaal geven
           grijs; laat ze uiteenlopen en er komt kleur in. */
        tintAmount: { value: painting.tintAmount, min: 0, max: 0.6, step: 0.005 },
        paletteBase: { value: painting.paletteBase, step: 0.02 },
        paletteAmplitude: { value: painting.paletteAmplitude, step: 0.02 },
        paletteFrequency: { value: painting.paletteFrequency, step: 0.05 },
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
      bareObject: controls.bareObject,
      diveEnabled: controls.diveEnabled,
      object: {
        ...object,
        fogDepth: controls.fogDepth,
        color: controls.color,
        length: controls.length,
        followSpeed: controls.followSpeed,
        driftRadius: controls.driftRadius,
        driftSpeed: controls.driftSpeed,
        matcapBase: controls.matcapBase,
        matcapSweep: controls.matcapSweep,
        matcapGloss: controls.matcapGloss,
        matcapGlossWidth: controls.matcapGlossWidth,
        matcapRim: controls.matcapRim,
        matcapRimGap: controls.matcapRimGap,
        shadowTint: controls.shadowTint,
        lightTint: controls.lightTint,
        rimTint: controls.rimTint,
        iridescence: controls.iridescence,
        iridescenceSpread: controls.iridescenceSpread,
        lightAngle: controls.lightAngle,
        lightHeight: controls.lightHeight,
        lightPunch: controls.lightPunch,
        ambient: controls.ambient,
        shadeFloor: controls.shadeFloor,
        reachSide: controls.reachSide,
        releaseRate: controls.releaseRate,
        trailRate: controls.trailRate,
        orbitRadius: controls.orbitRadius,
        orbitRate: controls.orbitRate,
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
        rollAngle: controls.rollAngle,
        rollRate: controls.rollRate,
        leanAngle: controls.leanAngle,
        glideHold: controls.glideHold,
        thrustResponse: controls.thrustResponse,
        tailSway: controls.tailSway,
        tailRate: controls.tailRate,
        tailWave: controls.tailWave,
        neckFollow: controls.neckFollow,
        neckRate: controls.neckRate,
        lookGive: controls.lookGive,
        gazeSweep: controls.gazeSweep,
        gazeRate: controls.gazeRate,
        soarLift: controls.soarLift,
        soarRate: controls.soarRate,
        idleAfter: controls.idleAfter,
        diveEvery: controls.diveEvery,
        diveAcceleration: controls.diveAcceleration,
        pitchTime: controls.pitchTime,
        awayTime: controls.awayTime,
        enterRate: controls.enterRate,
      },
      simulation: {
        ...simulation,
        firstNoiseScale: controls.firstNoiseScale,
        secondNoiseScale: controls.secondNoiseScale,
        gapVelocityBoost: controls.gapVelocityBoost,
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
        presence: controls.presence,
        presenceHoles: controls.presenceHoles,
        presenceScale: controls.presenceScale,
        presenceDrift: controls.presenceDrift,
        tintAmount: controls.tintAmount,
        paletteBase: controls.paletteBase as [number, number, number],
        paletteAmplitude: controls.paletteAmplitude as [number, number, number],
        paletteFrequency: controls.paletteFrequency as [number, number, number],
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
