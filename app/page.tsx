'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import type { FluidSceneConfig } from '@/components/FluidScene/types'
import { defaultConfig } from '@/components/FluidScene/config'
import styles from './page.module.css'

/* de scene raakt WebGL aan en mag dus niet meedraaien op de server */
const FluidScene = dynamic(() => import('@/components/FluidScene'), { ssr: false })

/* het afstelpaneel bestaat alleen tijdens ontwikkelen; door de dynamische
   import komt leva niet in de productiebundel terecht */
const DebugPanel =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('@/components/DebugPanel'), { ssr: false })
    : null

const Home = () => {
  const [config, setConfig] = useState<FluidSceneConfig>(defaultConfig)

  return (
    <div className={styles.page}>
      <FluidScene className={styles.scene} config={config} modelUrl="/models/dragon-flying.glb" />
      <p className={styles.hint}>
        Beweeg je muis om de vloeistof te beroeren. De draak hangt in het midden
        en roert met zijn vleugels, een klik geeft een kleurimpuls.
      </p>
      {DebugPanel ? <DebugPanel value={config} onChange={setConfig} /> : null}
    </div>
  )
}

export default Home
