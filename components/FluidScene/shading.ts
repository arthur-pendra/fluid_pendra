import {
  BufferAttribute,
  Color,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  Vector3,
  type BufferGeometry,
} from 'three'
import type { ShadingConfig } from './types'

/**
 * De draak belichten volgens hetzelfde recept als de vis van Immersive Garden.
 *
 * Twee dingen moesten daarvoor opgelost worden, en het eerste is een blokkade.
 *
 * ## Het model heeft geen normalen
 *
 * De glb is geëxporteerd als `KHR_materials_unlit` met een ingebakken
 * kleurtextuur, en dan gooit de exporteur de normalen weg — bij unlit heb je ze
 * niet nodig. Alleen is een matcap juist een opzoeking óp de normaal, dus zonder
 * die niets: geen glans, geen randlicht, geen lamp. Vandaar dat er tot nu toe
 * een `MeshBasicMaterial` op stond; er viel niets anders mee te doen.
 *
 * `BufferGeometry.computeVertexNormals` lijkt het antwoord maar is het niet. Die
 * middelt per vertex, en een derde van dit model bestaat uit vertices die voor
 * de uv-naden gesplitst zijn. Opgemeten op dit model:
 *
 *     vertices            12267
 *     unieke plekken      10166
 *     splitsvertices       3989  (32,5%)
 *     afwijking op naden: gemiddeld 30,8°, ergste 171,0°
 *
 * Elke helft van zo'n naad ziet maar de helft van de driehoeken, dus je krijgt
 * twee verschillende normalen op dezelfde plek. Dat is een scheur in de
 * belichting, en bij een draak lopen die naden precies over de rug en de
 * vleugels. `smoothNormals` middelt daarom per plék en niet per vertex.
 *
 * Dat maakt wel alles rond. Bewuste harde randen — hoorns, klauwen — worden
 * gladgestreken. Wil je die houden, dan is een export mét normalen uit Blender
 * de betere weg; dit blijft dan vanzelf van het model af, want er wordt niets
 * berekend als er al normalen zijn.
 *
 * ## Het recept van de vis
 *
 * Uit hun fragment-shader, en het is niet wat je verwacht:
 *
 *     light  = ambient(1.0) + pointLight(...)
 *     render = vec3(matcap.r)   // grijswaarde, geen kleur
 *     render *= light
 *     render *= base.r          // ook grijswaarde
 *     render += base.r          // <- de optelling
 *
 * De matcap levert bij hen geen kleur maar een belichtingsramp; het metaal komt
 * uit het contrast in die ramp plus de specular van de lamp. En die laatste
 * optelling is het eigenlijke geheim: eerst vermenigvuldigen, dan de basiskleur
 * er nog een keer bíj. Dat legt een bodem onder het beeld zodat het nooit naar
 * zwart zakt, en dat is de doorschenen gloed die je bij die vis ziet.
 *
 * Bij ons telt die bodem nog zwaarder dan bij hen. De draak wordt alleen
 * onthuld waar de vloeistof geroerd is (zie painting.ts), dus zachte schaduw
 * wordt door dat masker opgegeten. Zonder bodem blijft er van de belichting
 * niets over dan een silhouet.
 *
 * Eén ding doen we anders. Zij lezen hun kleurtextuur als grijswaarde; wij
 * hebben een echte kleurtextuur op de draak, dus die gaat als kleur mee. Het
 * verschil is dat hun vis zijn kleur uit de matcap moet halen en die van ons
 * niet.
 *
 * ## Waarom de matcap gerekend wordt en niet geladen
 *
 * Een matcap is een schijf waarin elke plek staat voor een normaal die die kant
 * op wijst. Dat is een functie, geen kunstwerk — je kunt hem dus uitrekenen. Dat
 * scheelt een bestand dat geladen moet worden, en het maakt elke eigenschap een
 * knop in plaats van iets waar je een nieuwe png voor moet zoeken.
 *
 * Pure functies over getallen, zodat het te testen is zonder een gpu.
 */

/**
 * Normalen berekenen en per plek middelen in plaats van per vertex.
 *
 * Laat de geometrie met rust als er al normalen zijn: een model dat ze zelf
 * meebrengt heeft betere dan wij hier kunnen maken, want daar zitten de harde
 * randen van de rigger nog in.
 *
 * De vlaknormalen worden opgeteld zónder ze eerst te normaliseren. De lengte van
 * een kruisproduct is het dubbele van de oppervlakte van de driehoek, dus grote
 * driehoeken wegen vanzelf zwaarder — precies wat je wilt, anders trekt een
 * cluster kleine driehoekjes de normaal scheef.
 */
export const smoothNormals = (geometry: BufferGeometry): boolean => {
  if (geometry.getAttribute('normal')) return false

  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  if (!position || !index) return false

  const count = position.count
  const sums = new Float32Array(count * 3)

  for (let corner = 0; corner < index.count; corner += 3) {
    const a = index.getX(corner)
    const b = index.getX(corner + 1)
    const c = index.getX(corner + 2)

    const ax = position.getX(a)
    const ay = position.getY(a)
    const az = position.getZ(a)
    const ex = position.getX(b) - ax
    const ey = position.getY(b) - ay
    const ez = position.getZ(b) - az
    const fx = position.getX(c) - ax
    const fy = position.getY(c) - ay
    const fz = position.getZ(c) - az

    const nx = ey * fz - ez * fy
    const ny = ez * fx - ex * fz
    const nz = ex * fy - ey * fx

    for (const vertex of [a, b, c]) {
      sums[vertex * 3] += nx
      sums[vertex * 3 + 1] += ny
      sums[vertex * 3 + 2] += nz
    }
  }

  /* Vertices die op dezelfde plek liggen tellen bij elkaar op. Dit is de hele
     ingreep: zonder deze stap houdt elke helft van een uv-naad zijn eigen halve
     gemiddelde over, en dat zie je als een scheur. */
  const groups = new Map<string, number[]>()
  for (let vertex = 0; vertex < count; vertex++) {
    /* op een rooster leggen, want twee helften van een naad staan op precies
       dezelfde plek maar niet altijd op precies hetzelfde bit */
    const key = `${Math.round(position.getX(vertex) * 1e5)},${Math.round(
      position.getY(vertex) * 1e5,
    )},${Math.round(position.getZ(vertex) * 1e5)}`
    const group = groups.get(key)
    if (group) group.push(vertex)
    else groups.set(key, [vertex])
  }

  const normals = new Float32Array(count * 3)
  for (const group of groups.values()) {
    let x = 0
    let y = 0
    let z = 0
    for (const vertex of group) {
      x += sums[vertex * 3]
      y += sums[vertex * 3 + 1]
      z += sums[vertex * 3 + 2]
    }

    const length = Math.hypot(x, y, z)
    /* een vertex waar de driehoeken elkaar precies opheffen — een vlies dat
       dubbel ligt — heeft geen richting; recht naar de camera is dan het minst
       verkeerde antwoord */
    const [ux, uy, uz] = length > 1e-9 ? [x / length, y / length, z / length] : [0, 0, 1]

    for (const vertex of group) {
      normals[vertex * 3] = ux
      normals[vertex * 3 + 1] = uy
      normals[vertex * 3 + 2] = uz
    }
  }

  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  return true
}

/** de kant waar het licht vandaan komt, in de ruimte van de camera */
export const lightDirection = (config: ShadingConfig): Vector3 => {
  const angle = (config.lightAngle * Math.PI) / 180
  /* lightHeight 1 is recht van voren, 0 is precies van opzij; daartussen loopt
     de lamp over een kwartbol */
  const face = Math.max(0, Math.min(1, config.lightHeight))
  const flat = Math.sqrt(Math.max(0, 1 - face * face))
  return new Vector3(Math.cos(angle) * flat, Math.sin(angle) * flat, face)
}

/**
 * De helderheid van de matcap voor één normaal.
 *
 * Vijf termen, en ze doen los van elkaar iets anders:
 *
 *   base   de grondtoon, waar niets op valt
 *   sweep  de overgang van donker naar licht langs de lichtrichting. De macht
 *          erop is wat metaal van huid onderscheidt: hoog maakt de overgang kort
 *          en hard, laag maakt hem breed en zacht. Laag is waar het dromerige
 *          vandaan komt — de vis van Immersive Garden is over zijn hele midden
 *          één brede gradiënt, van 197 in het hart naar 45 op driekwart.
 *   gloss  de glans, met een eigen breedte. Smal is een lichtpuntje op metaal,
 *          breed is de zachte bloem die die vis over zijn hele rug heeft.
 *   rim    het randlicht, op de uiterste rand van het silhouet
 *   gap    en de donkere band net dáárbinnen
 *
 * Die laatste twee horen bij elkaar en zijn samen één ding. Een randlicht dat
 * gestaag oploopt naar de rand geeft een zachte gloed; pas doordat het er eerst
 * dóórheen zakt en dan omhoog schiet wordt het een lijn die je los van het lijf
 * ziet liggen. Opgemeten uit hun matcap, over het rode kanaal dat hun shader
 * leest: 197 in het midden, 45 op driekwart, 119 op de rand.
 *
 * Er wordt hier niet afgekapt. Dat gebeurt pas bij het schrijven van de textuur,
 * en die schaalt zichzelf eerst — zie `matcapTexture`.
 */
export const matcapValue = (
  normal: { x: number; y: number; z: number },
  light: Vector3,
  config: ShadingConfig,
): number => {
  const lambert = normal.x * light.x + normal.y * light.y + normal.z * light.z

  /* half lambert: de schaduwkant valt niet naar nul maar loopt door, zodat er
     ook aan de donkere kant nog vorm te zien is */
  const wrapped = lambert * 0.5 + 0.5
  const sweep = Math.pow(wrapped, Math.max(0.05, config.matcapSweep))

  /* het licht om de normaal spiegelen en kijken hoeveel er recht naar de camera
     terugkomt; de camera kijkt in de matcap altijd langs +z */
  const reflected = 2 * lambert * normal.z - light.z
  const gloss =
    Math.pow(Math.max(0, reflected), Math.max(1, config.matcapGlossWidth)) * config.matcapGloss

  /* hoe ver deze normaal van de camera af buigt: 0 in het hart van de schijf,
     1 op de rand, en de rand ís het silhouet */
  const turn = 1 - Math.max(0, normal.z)

  const rim = Math.pow(turn, RIM_SHARPNESS) * config.matcapRim

  /* De band. Een bult die piekt net binnen de rand en op de rand zelf weer nul
     is, zodat hij het randlicht niet opeet maar ervoor gaat liggen. */
  const ramp = Math.max(0, 1 - Math.abs(turn - GAP_CENTRE) / GAP_WIDTH)
  const gap = ramp * ramp * (3 - 2 * ramp) * config.matcapRimGap

  return config.matcapBase + sweep * (1 - config.matcapBase) + gloss + rim - gap
}

/**
 * Hoe strak het randlicht is, en waar de donkere band ervoor ligt.
 *
 * Constanten en geen knoppen: dit is de vórm van die twee, en hoe sterk ze zijn
 * staat al in de config. Nog twee knoppen erbij zou vier getallen opleveren die
 * op elkaar lijken te lijken.
 */
const RIM_SHARPNESS = 6
const GAP_CENTRE = 0.38
const GAP_WIDTH = 0.34

/** de zijde van de gerekende matcap; groter levert niets op want hij wordt toch
    lineair gefilterd en de ramp is glad */
const MATCAP_SIZE = 128

/**
 * De matcap uitrekenen als textuur.
 *
 * De schijf loopt van -1 tot 1 over beide assen. Binnen de eenheidscirkel staat
 * elk punt voor de normaal die daar naartoe wijst, met z uit de bol erbij;
 * daarbuiten is er geen normaal en wordt de rand doorgetrokken, want daar kijkt
 * de opzoeking alleen naar door afrondingsruis op het silhouet.
 */
/**
 * De kleur van de matcap op één plek, uit de ramp.
 *
 * Hiervóór was de schijf grijs — het recept van de vis, waar de matcap alleen
 * belichting levert en de kleur uit hun koi-textuur komt. Wij hebben die textuur
 * ook, maar grijs maal een textuur is schaduw en geen materiaal: je kunt de
 * draak er lichter en donkerder mee maken en verder niets.
 *
 * Nu loopt de ramp van een schaduwkleur naar een lichtkleur, met de rand als
 * derde. Koel in de schaduw en warm in het licht is het oudste trucje dat er is,
 * en het werkt omdat je ogen dat verschil als diepte lezen — niet als twee
 * kleuren.
 *
 * En er ligt een verschuiving overheen die met de hoek meeloopt. Dat is wat een
 * zeepbel en een libellenvleugel doen: dezelfde plek is een andere kleur zodra
 * hij wegdraait. Bij een draak die voortdurend kantelt betekent het dat er een
 * zweem over zijn vleugel spoelt terwijl hij de bocht in gaat, zonder dat er
 * iets beweegt in de shader.
 *
 * De cosinuspalet-vorm is dezelfde als in painting.ts: drie golven met een
 * verschoven fase geven een kleurcirkel zonder tabel of textuur.
 */
const iridescent = (turn: number, config: ShadingConfig): [number, number, number] => {
  const phase = turn * config.iridescenceSpread
  return [
    Math.cos(TAU * phase),
    Math.cos(TAU * (phase + 1 / 3)),
    Math.cos(TAU * (phase + 2 / 3)),
  ]
}

const TAU = Math.PI * 2

/**
 * De matcap uitrekenen als textuur.
 *
 * De schijf loopt van -1 tot 1 over beide assen. Binnen de eenheidscirkel staat
 * elk punt voor de normaal die daar naartoe wijst, met z uit de bol erbij;
 * daarbuiten is er geen normaal en wordt de rand doorgetrokken, want daar kijkt
 * de opzoeking alleen naar door afrondingsruis op het silhouet.
 *
 * In twee doorgangen, en dat moet ook: de ramp wordt eerst helemaal uitgerekend
 * en dan pas op zijn eigen bereik uitgerekt. Zie de tweede lus voor waarom.
 */
export const matcapTexture = (config: ShadingConfig): DataTexture => {
  const light = lightDirection(config)

  const shadow = new Color(config.shadowTint)
  const lit = new Color(config.lightTint)
  const edge = new Color(config.rimTint)

  const pixels = MATCAP_SIZE * MATCAP_SIZE
  const ramp = new Float32Array(pixels)
  const turns = new Float32Array(pixels)

  let lowest = Infinity
  let highest = -Infinity

  for (let row = 0; row < MATCAP_SIZE; row++) {
    for (let column = 0; column < MATCAP_SIZE; column++) {
      const x = ((column + 0.5) / MATCAP_SIZE) * 2 - 1
      const y = ((row + 0.5) / MATCAP_SIZE) * 2 - 1

      const radius = Math.hypot(x, y)
      const scale = radius > 1 ? 1 / radius : 1
      const nx = x * scale
      const ny = y * scale
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))

      const slot = row * MATCAP_SIZE + column
      const value = matcapValue({ x: nx, y: ny, z: nz }, light, config)
      ramp[slot] = value
      turns[slot] = 1 - nz
      if (value < lowest) lowest = value
      if (value > highest) highest = value
    }
  }

  /* De ramp op zijn eigen bereik uitrekken voordat hij in acht bits gaat.
     Zonder dit werd hij afgekapt, en dat was niet zomaar een detail: op de
     standaardwaarden liep de ramp tot 1,73 en stond negen procent van de schijf
     vlak op wit. Elke knop die je daarna omhoog draaide schoof alleen méér vlak
     tegen dat plafond — de vorm was er dan al af, dus je zag niets veranderen.

     Vandaar twee doorgangen: het bereik is pas bekend als alles uitgerekend is.
     Zo verandert een knop de vórm van de ramp in plaats van hoeveel ervan
     verloren gaat. Hoe licht hij uiteindelijk is, is een aparte zaak; daar is
     `ambient` voor, en die staat achter de textuur in plaats van erin. */
  const span = Math.max(1e-6, highest - lowest)
  const data = new Uint8Array(pixels * 4)

  for (let slot = 0; slot < pixels; slot++) {
    const level = (ramp[slot] - lowest) / span
    const turn = turns[slot]

    /* van schaduw naar licht, met de rand als derde kleur eroverheen */
    const rim = Math.pow(turn, RIM_SHARPNESS)
    const shift = iridescent(turn, config)

    const channel = (dark: number, bright: number, band: number, wave: number) => {
      const base = dark + (bright - dark) * level
      const withEdge = base + (band - base) * rim * Math.min(1, config.matcapRim)
      return Math.max(0, Math.min(1, withEdge + wave * config.iridescence * level))
    }

    const out = slot * 4
    data[out] = Math.round(channel(shadow.r, lit.r, edge.r, shift[0]) * 255)
    data[out + 1] = Math.round(channel(shadow.g, lit.g, edge.g, shift[1]) * 255)
    data[out + 2] = Math.round(channel(shadow.b, lit.b, edge.b, shift[2]) * 255)
    data[out + 3] = 255
  }

  const texture = new DataTexture(data, MATCAP_SIZE, MATCAP_SIZE, RGBAFormat)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/**
 * Hoe strak de glans van de losse lamp is, en hoe hard die met de afstand
 * wegvalt.
 *
 * De lamp staat naast de matcap en doet iets wat die niet kan. Een matcap zit
 * vast aan de camera: draai de draak en de glans veegt over hem heen, maar
 * verpláátst hij zich, dan verandert er niets. Deze lamp staat in de scene, dus
 * hij wordt lichter als hij ernaartoe vliegt. Dat is bij de vis precies zo
 * opgezet, en het is het verschil tussen een belicht model en een belichte
 * scene.
 *
 * Het verval is klein omdat het vlak waar hij op zweeft maar een paar eenheden
 * breed is; op de waarde van IG zou de lamp bij ons overal even sterk zijn.
 */
const POINT_SHARPNESS = 8
const POINT_DECAY = 0.22

/** hoe ver de lamp van het midden af staat, in dezelfde eenheden als de scene */
const POINT_DISTANCE = 2.6

/** waar de lamp hangt, in de wereld van de objectscene */
export const lightPosition = (config: ShadingConfig): Vector3 => {
  const direction = lightDirection(config)
  /* de matcap kijkt langs +z en de objectscene langs +y, dus die twee assen
     wisselen; anders zou de lamp uit een andere hoek komen dan de glans */
  return new Vector3(direction.x, direction.z, -direction.y).multiplyScalar(POINT_DISTANCE)
}

/**
 * De uitgaande kleur van three's matcap-shader vervangen door het recept van de
 * vis. Zie de kop van dit bestand voor waar dat recept vandaan komt.
 *
 * De rest van de shader blijft staan, en dat is de hele reden om hierop te
 * haken in plaats van een eigen materiaal te schrijven: skinning, mist, het
 * uitsnijden van de vleugelvliezen en het omklappen van de normaal op
 * achterkanten komen allemaal uit three en hoeven we niet na te bouwen.
 */
export const shadeLikeTheFish = /* glsl */ `
  vec3 light = vec3(uAmbient);

  /* Alles gebeurt in de ruimte van de camera, want daar staat de normaal al in.
     De lamp komt als wereldplek binnen — daar hoort hij ook, hij staat in de
     scene en niet op de camera — en gaat hier één keer mee door viewMatrix.
     Dat is de goedkoopste plek om die twee gelijk te trekken: één matrixproduct
     per pixel tegenover een extra varying voor de wereldplek van elk vertex.

     Zonder deze stap staat de lamp in een andere ruimte dan het oppervlak. Bij
     een camera die recht naar beneden kijkt is dat een vaste kwartslag, dus het
     ziet er niet kapot uit — het licht komt alleen uit de verkeerde hoek, en dat
     is precies het soort fout dat je nooit vindt door ernaar te kijken. */
  vec3 lampInView = (viewMatrix * vec4(uLightPosition, 1.0)).xyz;
  vec3 surface = -vViewPosition;

  vec3 toLight = lampInView - surface;
  float distanceToLight = length(toLight);
  vec3 lightDirection = normalize(toLight);
  vec3 lightReflection = reflect(-lightDirection, normal);

  float shading = max(0.0, dot(normal, lightDirection));
  float punch = pow(max(0.0, -dot(lightReflection, normalize(surface))), float(${POINT_SHARPNESS}));
  float decay = max(0.0, 1.0 - distanceToLight * float(${POINT_DECAY}));

  light += uLightPunch * decay * (shading + punch);

  /* De matcap in kleur en niet als grijswaarde. Bij de vis staat hier alleen het
     rode kanaal — daar is de matcap puur belichting en komt de kleur
     uit hun koi-textuur. Onze ramp draagt zelf een koele schaduw, een warme
     lichtkant en een randkleur, en dat is het verschil tussen schaduw en
     materiaal. Zie de kop van dit bestand. */
  vec3 outgoingLight = matcapColor.rgb;
  outgoingLight *= light;
  outgoingLight *= diffuseColor.rgb;

  /* En dan de optelling die het bij de vis doet: eerst vermenigvuldigen, dan de
     basiskleur er nog een keer bij. Dat legt een bodem onder het beeld zodat het
     nooit naar zwart zakt — bij ons extra nodig, want het onthullingsmasker in
     painting.ts eet zachte schaduw op. */
  outgoingLight += diffuseColor.rgb * uShadeFloor;
`
