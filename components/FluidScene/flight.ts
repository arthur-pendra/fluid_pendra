import type { FlightConfig, Vec2 } from './types'

/**
 * Zweven op de vleugels, met de kop vooruit.
 *
 * Twee eerdere opzetten zijn hierop stukgelopen en die zijn het noemen waard,
 * want ze zijn allebei aantrekkelijk.
 *
 * De eerste was een doelvolger met een lissajous eroverheen. Die schoof
 * zijwaarts door het beeld: het lijf wees de ene kant op en de beweging ging de
 * andere kant op, en dat leest als een sprite die verschoven wordt.
 *
 * De tweede draaide dat om — altijd vooruit langs de eigen neus, en de koers
 * draaide vrij rond. Dat vliegt wel, maar dan vliegt hij ook wég: hij keert om,
 * gaat ondersteboven het beeld door, en de camera hangt niet meer boven een
 * draak maar boven een baan.
 *
 * Wat het wél moet zijn zit ertussenin. De kop staat vast naar voren, en de twee
 * assen doen los van elkaar iets anders:
 *
 *   Zijwaarts volgt hij de cursor. Niet er meteen op staan maar er met gewicht
 *   naartoe, want het is dat achterlopen dat de kanteling voedt. Staat de cursor
 *   niet in beeld, dan is het doel het midden.
 *
 *   Naar voren en achteren volgt hij de cursor ook, maar de twee richtingen zijn
 *   met opzet niet gelijk. Vooruit kost slagen: hij komt alleen naar voren als de
 *   vleugels werken, in de zetjes die uit `boost` komen. Achteruit kost niets, dus
 *   dan zweeft hij met de vleugels open terug, traag en gelijkmatig.
 *
 * Die asymmetrie is het punt. Een vogel klapwiekt niet om achteruit te zakken —
 * die spreidt zijn vleugels en laat zich dragen. Het gevolg is dat de clip niet
 * los van de vlucht loopt: `beating` zegt of hij er slagen voor nodig heeft, en
 * daar wordt de klok van de animatie mee gestuurd. Heeft hij ze niet nodig, dan
 * kruipt de clip naar zijn zweefstand en blijft daar hangen tot je vóór hem komt.
 * En dan valt het rond: geen slagen betekent geen gemeten slagkracht, dus ook
 * geen `boost`, dus ook geen zet naar voren.
 *
 * Het lijf kantelt mee met hoe hard hij zijwaarts gaat, en dát is wat het zweven
 * van schuiven onderscheidt: een vleugel die naar rechts draagt heeft zijn neus
 * ook naar rechts. Zonder die kanteling wijst het lijf de ene kant op terwijl de
 * beweging de andere kant op gaat, en dan leest het als een sprite.
 *
 * Die haal levert drie standen op en niet één, allemaal uit hetzelfde getal:
 *
 *   bank  de neus draait de bocht in, gezien van bovenaf
 *   roll  het lijf legt zich in die bocht, om zijn eigen lengteas
 *   lean  en los daarvan hangt hij een graad of wat naar de kant waar jij staat
 *
 * De eerste twee horen bij elkaar omdat een vogel niet stuurt zoals een auto:
 * hij legt zich scheef en de bocht volgt daaruit. De derde staat er los van en
 * is met opzet klein. Hij komt niet uit wat hij doet maar uit waar jij bent, en
 * hij blijft dus staan als hij eenmaal bij je is. Anders staat een draak die je
 * ingehaald heeft weer kaarsrecht en is het contact precies dán weg.
 *
 * De ruis is waarde-ruis en geen som van sinussen. Een lissajous heeft een
 * periode, en over een minuut kijken zie je die terugkomen — precies het patroon
 * dat we met een procedurele laag juist proberen weg te halen.
 *
 * Pure functies over getallen, zodat het gedrag te testen is zonder three.js.
 */
export type FlightState = {
  /** waar hij hangt, op het vlak waar het object zweeft; `y` is de z-as */
  position: Vec2
  /** hoeveel het lijf meekantelt met het zweven, in graden om de vaste koers */
  bank: number
  /**
   * Hoeveel hij om zijn eigen lengteas ligt, in graden.
   *
   * Uit dezelfde zijwaartse snelheid als `bank`, en dat is het punt: één oorzaak,
   * twee gevolgen. De neus draait de bocht in en het lijf legt zich erin, zoals
   * dat hoort. Deze staat los zodat het tempo mag verschillen, want rollen gaat
   * in de lucht voor op draaien.
   */
  roll: number
  /**
   * Hoeveel hij naar de kant van de cursor hangt, in graden.
   *
   * Dit komt niet uit zijn snelheid maar uit waar jij bent, en daarom staat het
   * apart van `bank`: het blijft staan als hij stilhangt. Zonder dit staat een
   * draak die zijn plek bereikt heeft weer kaarsrecht, hoe ver jij ook opzij
   * bent, en dan is het contact weg zodra hij je ingehaald heeft.
   */
  lean: number
  /**
   * Of de vleugels werken, 0 tot 1, gedempt.
   *
   * Hier hangt de klok van de animatieclip aan: op 0 kruipt die naar zijn
   * zweefstand en blijft daar hangen, op 1 loopt hij zijn slagen af.
   */
  beating: number
  /** verstreken tijd, voedt de ruis */
  elapsed: number
}

/**
 * De vaste koers: recht naar boven op het scherm. Door `spin` staat het model
 * daar al op, dus wat `bank` erbij doet is meteen de draai die het krijgt.
 */
export const BASE_HEADING = 90

/**
 * Gladde ruis van 0 tot 1, zonder toestand en zonder tabel.
 *
 * Waarde-ruis en geen som van sinussen: die laatste heeft een periode, en over
 * een minuut kijken zie je die terugkomen.
 */
export const noise = (x: number): number => {
  const whole = Math.floor(x)
  const fraction = x - whole

  const hash = (n: number) => {
    const value = Math.sin(n * 127.1) * 43758.5453
    return value - Math.floor(value)
  }

  /* smoothstep tussen twee trekkingen, zodat de afgeleide niet springt */
  const blend = fraction * fraction * (3 - 2 * fraction)
  return hash(whole) * (1 - blend) + hash(whole + 1) * blend
}

/** ruis van -1 tot 1, met een eigen plek in het veld zodat de assen verschillen */
const swing = (elapsed: number, rate: number, offset: number) =>
  noise(elapsed * rate + offset) * 2 - 1

/**
 * Het kleine zweven dat er altijd overheen ligt, zodat hij ook op zijn plek nooit
 * helemaal stilhangt. Een zuivere functie van de tijd, dus de begintoestand kan
 * hem uitrekenen in plaats van op nul te beginnen — anders stond hij één frame na
 * het laden ineens waar de ruis hem wilde hebben.
 */
const hover = (elapsed: number, config: FlightConfig): number =>
  swing(elapsed, config.driftRate, 41.7) * config.driftAhead

export const createFlightState = (config: FlightConfig): FlightState => ({
  position: { x: 0, y: hover(0, config) },
  bank: 0,
  roll: 0,
  lean: 0,
  beating: 0,
  elapsed: 0,
})

/** een hoek in graden terug naar het bereik -180 tot 180 */
export const wrapAngle = (degrees: number): number => {
  const wrapped = (((degrees + 180) % 360) + 360) % 360
  return wrapped - 180
}

/**
 * Eén stap.
 *
 * `boost` is hoeveel slag er nu in de vleugels zit, 0 tot 1. `cursor` is waar de
 * cursor op het vlak staat, of null als die niet in beeld is — dan is het midden
 * het doel. `reach` is hoe ver hij mag komen, zijwaarts en naar voren, in
 * dezelfde eenheden.
 */
export const stepFlight = (
  state: FlightState,
  config: FlightConfig,
  boost: number,
  cursor: Vec2 | null,
  reach: Vec2,
  delta: number,
): FlightState => {
  const elapsed = state.elapsed + delta

  /* Het doel blijft binnen zijn bereik, ook als de cursor tegen de rand van het
     scherm staat: anders vliegt hij het beeld half uit om erbij te kunnen.
     `reach` komt van de aanroeper omdat het aan de breedte van het venster
     hangt, en die kent dit bestand niet. */
  const wanted = Math.max(-reach.x, Math.min(reach.x, cursor?.x ?? 0))

  /* er met gewicht naartoe en niet erop springen. Dat achterlopen is niet alleen
     mooier, het is ook wat de kanteling voedt: zonder snelheidsverschil is er
     niets om op te kantelen. */
  const x = state.position.x + (wanted - state.position.x) * (1 - Math.exp(-config.followRate * delta))

  /* Naar voren en achteren, en hier lopen de twee richtingen uiteen.

     Vooruit is op het scherm omhoog, en `y` is de z-as die daar andersom loopt,
     dus vooruit betekent dat `y` moet dalen. Dat gaat alleen met slagen: de
     afgelegde weg is `boost` maal de stuwkracht, dus tussen twee slagen door
     schuift hij niet op. Achteruit is zweven en kost geen slag, dus dat gaat op
     een eigen, trage snelheid.

     De ruis ligt er los overheen zodat hij op zijn plek nooit stilhangt. Het doel
     is de plek zonder die ruis, anders jaagt hij zijn eigen gewiebel achterna. */
  const wantedAhead = Math.max(-reach.y, Math.min(reach.y, cursor?.y ?? 0))
  const settled = state.position.y - hover(state.elapsed, config)
  const gap = wantedAhead - settled

  /* een dode zone rond het doel, anders klappert hij tussen slaan en zweven */
  const needsForward = gap < -config.arriveGap

  const travel = needsForward
    ? Math.max(-boost * config.beatThrust * delta, gap)
    : Math.min(config.glideBack * delta, Math.max(0, gap))

  /* zolang hij vooruit moet blijven de vleugels werken, daarna zakt het weg en
     kruipt de clip naar zijn zweefstand */
  const beating =
    state.beating +
    ((needsForward ? 1 : 0) - state.beating) * (1 - Math.exp(-config.beatRate * delta))

  const position = { x, y: settled + travel + hover(elapsed, config) }

  /* Het lijf kantelt mee met hoe hard hij zijwaarts gaat. Afgezet tegen de
     snelheid van een besliste haal — een sprong over zijn halve bereik — zodat
     `bankAngle` in graden staat en niet meebeweegt met het volgtempo. Naar
     rechts gaand hoort de neus ook naar rechts, en rechtsom is op het scherm de
     negatieve kant op. */
  const decisive = config.followRate * reach.x
  const sideways = decisive > 1e-9 ? (position.x - state.position.x) / delta / decisive : 0
  const swing = Math.max(-1, Math.min(1, sideways))
  const target = swing * -config.bankAngle

  /* er met vertraging naartoe: een lijf dat meteen op zijn eindstand staat
     kantelt niet, dat klapt */
  const bank = state.bank + (target - state.bank) * (1 - Math.exp(-config.bankRate * delta))

  /* Dezelfde haal legt hem ook in de bocht, om zijn eigen lengteas. Eén oorzaak
     en twee gevolgen, met hetzelfde teken: gaat hij naar rechts, dan wijst zijn
     neus naar rechts én zakt zijn rechtervleugel. Uit elkaar getrokken zou het
     twee losse bewegingen worden en dan leest het als een model dat schudt. */
  const roll =
    state.roll + (swing * -config.rollAngle - state.roll) * (1 - Math.exp(-config.rollRate * delta))

  /* En dan nog het kleine beetje dat niets met snelheid te maken heeft: waar jij
     staat. Naar de rauwe cursor en niet naar het afgekapte doel, want juist als
     je buiten zijn bereik gaat staan wil je zien dat hij je nog volgt — daar kán
     hij niet meer naartoe, dus is dit alles wat er overblijft.

     Op hetzelfde tempo als de kanteling, zodat de twee als één beweging lezen. */
  const toward = cursor && reach.x > 1e-9 ? (cursor.x - position.x) / reach.x : 0
  const wish = Math.max(-1, Math.min(1, toward)) * -config.leanAngle
  const lean = state.lean + (wish - state.lean) * (1 - Math.exp(-config.bankRate * delta))

  return { position, bank, roll, lean, beating, elapsed }
}
