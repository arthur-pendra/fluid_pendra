export type Vec2 = { x: number; y: number }
export type Vec3 = { x: number; y: number; z: number }

/**
 * De plekken waarmee een geanimeerd model zichzelf roert: de mesh plus de
 * vertexindexen die uitgekozen zijn. Per frame wordt daar de wereldpositie van
 * opgevraagd. Leeg voor de bol en voor modellen zonder animatie.
 */
export type StirSurface = {
  mesh: import('three').SkinnedMesh | null
  vertices: number[]
}

/** een opgemeten punt op het oppervlak van een model, zie stirSurface.ts */
export type PointMotion = {
  /** gemiddelde plek van het punt over de hele clip, in wereldruimte */
  center: Vec3
  /** grootste onderlinge afstand tussen de plekken die het punt aandoet */
  amplitude: number
}

export type ObjectConfig = {
  /** kleur van het ingebouwde object; een eigen model houdt zijn eigen kleur */
  color: string
  /** achtergrond van de render target, net iets donkerder dan de pagina */
  background: string
  /** lengte over de langste as, in scene-eenheden */
  length: number
  /**
   * De camera kijkt recht naar beneden op het object, en welke kant je dan te
   * zien krijgt hangt aan het model. Vandaar deze twee.
   *
   * `flipped` is een halve slag om de as die op het scherm van onder naar boven
   * loopt: je ziet de andere kant van het model, kop en staart blijven dezelfde
   * kant op wijzen.
   *
   * `spin` draait in het beeldvlak, in graden, en zet dus de kop de kant op die
   * je wil. 180 zet hem precies om.
   */
  flipped: boolean
  spin: number
  /** hoogte waarop het object zweeft */
  height: number
  /** snelheid richting het doel, in eenheden per seconde */
  followSpeed: number
  /** straal van de continue drift; op 0 valt het object stil */
  driftRadius: number
  /** tempo van die drift */
  driftSpeed: number
  /** aantal punten over de lengte van het object die de vloeistof beroeren */
  stirPoints: number
  /** hoe vaak de cursor een nieuw doel mag aanwijzen, in milliseconden */
  targetThrottle: number
}

export type SimulationConfig = {
  /** kantlengte van de vierkante simulatiebuffer */
  resolution: number
  /** vaste tijdstap van de oplosser, losgekoppeld van de framerate */
  timeStep: number
  /** hoeveel de stroming per stap inzakt */
  deceleration: number
  /** hoe lang de nagloed blijft staan; dicht bij 1 is lang */
  attenuation: number
  /** aantal Jacobi-iteraties voor het drukveld */
  pressureIterations: number

  /** hoeveel de ruisrichting de stroming overneemt */
  randomDirection: number
  /** schaal waarop de ruis gelezen wordt, grof en fijn */
  firstNoiseScale: number
  secondNoiseScale: number
  /** onder deze snelheid valt de stroming in gaten uiteen */
  velocityThreshold: number
  /** zetje dat de stroming in die gaten krijgt */
  gapVelocityBoost: number
  /** binnen welke ruiswaarden die gaten vallen */
  gapAmount: { min: number; max: number }

  /** krachtvermenigvuldiger van de cursor en van de objectpunten */
  cursorForce: number
  objectForce: number

  /**
   * De asymmetrie van de vleugelslag, zie strokeForce.ts. Geldt alleen voor een
   * geanimeerd model dat zichzelf roert; de bol en stille modellen drijven en
   * hebben geen slag om te dempen.
   *
   * `windDirection` is de kant waar de wind naartoe waait, in graden op het
   * scherm: 0 naar rechts, 90 naar boven. Dat is de staartkant van het model,
   * dus draai deze mee met `object.spin`.
   *
   * `strokeBias` laat de slag tegen de wind in glijden in plaats van duwen, 0
   * tot 1. Op 0 duwt de vleugel weer even hard heen als terug. Hoog hoort hier:
   * een terugslag die ook maar een beetje bovenwinds duwt loopt tegen het spoor
   * van de vorige neerslag in, en dat is wat de wind rommelig maakt. Op precies
   * 1 zet het penseel tijdens de halve slag terug geen kracht meer, en schrijft
   * het dus ook geen intensiteit.
   *
   * `strokeSteering` kamt weg wat er dwars op de windas gebeurt, 0 tot 1. Dat
   * deel is waarom de wind naar opzij uitwaaiert in plaats van naar achteren te
   * trekken. Niet helemaal dichtdraaien: wat overblijft houdt het onrustig
   * genoeg om natuurlijk te blijven.
   */
  windDirection: number
  strokeBias: number
  strokeSteering: number
  /** penseelstraal in uv bij volle snelheid */
  brushSize: number
  /** deel van die straal bij stilstand en bij volle snelheid */
  brushSizeAtRest: number
  brushSizeAtSpeed: number
  /** bij welke genormaliseerde snelheid de straal maximaal is */
  brushSpeedRange: number
  /** maat waarmee snelheden genormaliseerd worden */
  screenSpaceSize: number
  /** hoe snel intensiteit opbouwt over de afgelegde afstand */
  intensityVariation: number
  /** duur van de golf na een klik, in seconden */
  shockwaveDuration: number
}

export type PaintingConfig = {
  /** hoe ver de uv van het object meebuigt met het veld; op 0 wordt het model
      wel onthuld door de stroming maar niet vervormd */
  warp: number
  /** sterkte van de rimpel die de klikgolf in het beeld duwt */
  rippleStrength: number
  /** sterkte van de kleurzweem */
  tintAmount: number
  /** vaste delen van de kleurfunctie: a + b * cos(tau * (c * t + d)) */
  paletteBase: [number, number, number]
  paletteAmplitude: [number, number, number]
  paletteFrequency: [number, number, number]
  /** duur van de intro-fade, in seconden */
  revealDuration: number
}

export type FluidSceneConfig = {
  /** achtergrond van de pagina */
  background: string
  object: ObjectConfig
  simulation: SimulationConfig
  painting: PaintingConfig
}

export type FluidSceneProps = {
  /** pad naar een glb; laat je hem weg dan verschijnt de ingebouwde bol */
  modelUrl?: string
  /** eigen maatvoering; het component vult zijn ouder volledig */
  className?: string
  /** bevriest de simulatie zonder de scene af te breken */
  paused?: boolean
  /** afwijkende instellingen; standaard komt alles uit defaultConfig */
  config?: FluidSceneConfig
}
