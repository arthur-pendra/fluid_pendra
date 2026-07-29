import type { FluidSceneConfig } from './types'

/**
 * De scene lichter zetten op een apparaat dat het niet trekt.
 *
 * Zonder dit draait op een telefoon precies dezelfde belasting als op een
 * werkstation, en dat is geen theoretisch bezwaar: opgemeten kost de simulatie
 * op 1024² ongeveer een vijfde van een frame op deze machine, en die machine
 * haalt op 4096² nog 34 fps. Er is dus een factor vijf marge — ruim, maar niet
 * oneindig, en zwakke geïntegreerde graphics zitten daar makkelijk voorbij.
 *
 * Immersive Garden doet hetzelfde en gaat verder: daar staan tiers voor
 * `default`, `bad`, `low`, `mobile` en `tablet`, en op alles behalve een gezonde
 * desktop wordt de vloeistof volledig uitgezet. Dat kan bij hen omdat het bij
 * hen een laag over de pagina is. Bij ons ís de vloeistof de scene, dus
 * uitzetten bestaat niet en schalen is het enige antwoord.
 *
 * Wat er afgaat, en waarom juist dat:
 *
 *   De simulatie naar een kwart van de pixels. Dat is verreweg de grootste post
 *   en het kost het minst aan beeld, want de eindpass leest hem toch vervaagd.
 *
 *   De roerpunten bijna gehalveerd. De penseellus draait per pixel over álle
 *   penselen, dus dit is de duurste knop in de hele config. De referentie doet
 *   het met zeven; wij staan op veertien.
 *
 *   Het dpr-plafond naar 1. Een scherm met dpr 3 rendert anders negen keer zo
 *   veel pixels als er echt nodig zijn voor iets wat toch uitgesmeerd wordt.
 *
 * De herkenning hieronder is een gok en geen meting — er is geen betrouwbare
 * manier om vooraf te weten hoe snel een GPU is. Ze is daarom met opzet ruim:
 * liever een sterke telefoon onnodig licht dan een zwakke laptop op vol.
 */
export type Profile = 'vol' | 'licht'

/** wat de browser ons over het apparaat vertelt */
export type DeviceHints = {
  /** een vinger of stylus in plaats van een muis */
  coarsePointer: boolean
  /** `navigator.hardwareConcurrency`, of null als de browser het niet zegt */
  cores: number | null
  /** breedte van het venster in css-pixels */
  width: number
}

/** onder dit aantal kernen gaan we uit van een zwak apparaat */
const FEW_CORES = 4

/** onder deze breedte ook, want dan is het vrijwel zeker een telefoon */
const NARROW = 768

/**
 * Elk van deze drie op zich is genoeg. Ze overlappen flink — een telefoon scoort
 * meestal op alle drie — en dat is prima: het gaat erom dat een zwak apparaat er
 * niet doorheen glipt, niet om een nette indeling.
 */
export const readProfile = (hints: DeviceHints): Profile =>
  hints.coarsePointer || hints.width < NARROW || (hints.cores !== null && hints.cores <= FEW_CORES)
    ? 'licht'
    : 'vol'

/** de hints uit de browser halen; alleen aanroepen waar `window` bestaat */
export const deviceHints = (): DeviceHints => ({
  coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  cores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
  width: window.innerWidth,
})

/** het plafond voor de pixelverhouding van het canvas */
export const dprCeiling = (profile: Profile): number => (profile === 'licht' ? 1 : 1.5)

/**
 * De config lichter maken. Geeft hem onveranderd terug op `vol`, zodat er op een
 * gezond apparaat niets tussen zit.
 */
export const applyProfile = (config: FluidSceneConfig, profile: Profile): FluidSceneConfig =>
  profile === 'vol'
    ? config
    : {
        ...config,
        object: { ...config.object, stirPoints: Math.min(config.object.stirPoints, 8) },
        simulation: {
          ...config.simulation,
          resolution: Math.min(config.simulation.resolution, 512),
        },
      }
