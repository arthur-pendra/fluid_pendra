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
  /** de botketens waar de procedurele laag op schrijft; null zonder skelet */
  rig: import('./rig').ModelRig | null
}

/** een opgemeten punt op het oppervlak van een model, zie stirSurface.ts */
export type PointMotion = {
  /** gemiddelde plek van het punt over de hele clip, in wereldruimte */
  center: Vec3
  /** grootste onderlinge afstand tussen de plekken die het punt aandoet */
  amplitude: number
}

/**
 * Zelfstandig vliegen met de kop vooruit, zie flight.ts. Alleen voor een
 * geanimeerd model; de bol en stille modellen volgen de cursor en drijven, want
 * die hebben geen kop om vooruit te zetten.
 */
/**
 * Hoe de draak zich tot jouw cursor verhoudt, zie pursuit.ts. Staat los van
 * `FlightConfig`: die gaat over vliegen, deze over volgen.
 */
export type PursuitConfig = {
  /**
   * Hoe snel de plek die hij najaagt jouw cursor bijhoudt, per seconde.
   *
   * Dit is achterlópen en niet dempen. `followRate` maakt zijn beweging zacht;
   * dit maakt hem te laat. Laag laat hem bij een snelle zwenk de omkeerpunten
   * missen en de bocht afsnijden — wat een dier doet dat achter iets aan zit.
   */
  trailRate: number
  /**
   * Hoe snel hij zijn eigen gang gaat zodra jij uit beeld bent, per seconde.
   *
   * Veel trager dan `trailRate`: hij verliest je langzamer dan hij je volgt.
   * Daardoor zakt hij geleidelijk naar zijn eigen dwaalpunt in plaats van weg te
   * springen, en komt hij bij je terugkomst even geleidelijk weer mee. Op nul
   * blijft hij hangen waar je hem achterliet.
   */
  releaseRate: number
  /** hoe ver naast je cursor hij hangt, in wereldeenheden. Op 0 mikt hij er
      weer precies op en is het volgen zo direct als het was. */
  orbitRadius: number
  /** hoe vaak hij per seconde een rondje om je heen maakt. Laag houden: op 0,05
      duurt een rondgang twintig seconden, en dat is al goed te zien. */
  orbitRate: number
}

/**
 * Hoe de draak belicht wordt, zie shading.ts. Het recept komt van de vis van
 * Immersive Garden: een matcap als belichtingsramp, een losse lamp in de scene,
 * en een optelling die er een bodem onder legt.
 */
export type ShadingConfig = {
  /** de grondtoon van de ramp, waar geen licht op valt. Boven nul houden: op nul
      wordt de schaduwkant een gat in plaats van een vorm. */
  matcapBase: number
  /** hoe kort de overgang van donker naar licht is. Dit is wat metaal van huid
      onderscheidt — hoog maakt hem hard en glanzend, laag zacht en mat. */
  matcapSweep: number
  /** de glans, waar het licht recht in de camera weerkaatst */
  matcapGloss: number
  /** hoe smal die glans is. Hoog is een lichtpuntje op metaal, laag is een
      brede zachte bloem over zijn hele rug — en dat laatste is waar het
      dromerige van de vis vandaan komt. */
  matcapGlossWidth: number
  /** randlicht op de uiterste rand van het silhouet */
  matcapRim: number
  /** de kleur van zijn schaduwkant. Hier zit de stemming in: koel en blauwig
      leest als lucht en afstand, warm als iets dat zelf gloeit. */
  shadowTint: string
  /** de kleur van zijn lichte kant */
  lightTint: string
  /** de kleur van de lijn om zijn silhouet. Mag fel — het is een dunne rand, en
      juist daar valt een kleur op die nergens anders voorkomt. */
  rimTint: string
  /** hoeveel de tint verschuift met de hoek waaronder je hem ziet. Dit is wat
      een zeepbel en een libellenvleugel doen: dezelfde plek is een andere kleur
      zodra hij wegdraait. Klein houden — het is een zweem, geen regenboog. */
  iridescence: number
  /** over hoeveel hoek die verschuiving zich uitstrekt. Laag laat hem alleen op
      de rand gebeuren, hoog spoelt hem over het hele lijf. */
  iridescenceSpread: number

  /** hoe diep het net dáárbinnen wegzakt. Dit is wat van het randlicht een
      lijn maakt in plaats van een gloed: je ziet hem pas los van het lijf als
      er een donkere band tussen zit. Opgemeten uit de matcap van de vis. */
  matcapRimGap: number
  /** waar het licht vandaan komt, in graden om het beeldvlak */
  lightAngle: number
  /** 0 is precies van opzij, 1 recht van voren. Van opzij levert de meeste vorm
      op, van voren het meeste oppervlak. */
  lightHeight: number
  /** sterkte van de losse lamp in de scene. Die staat naast de matcap en doet
      iets wat die niet kan: lichter worden als hij ernaartoe vliegt. */
  lightPunch: number
  /** grondbelichting over alles heen */
  ambient: number
  /** hoeveel van de basiskleur er bovenop de vermenigvuldiging bij komt. Dit is
      de doorschenen gloed van de vis, en bij ons wat de belichting door het
      onthullingsmasker heen trekt. Op 0 blijft er een silhouet over. */
  shadeFloor: number
}

export type FlightConfig = {
  /** hoe ver hij zijwaarts van het midden gaat, als deel van de halve
      beeldbreedte. Een deel en geen wereldmaat, want anders gebruikt hij op een
      breed scherm maar een derde van de breedte en op een smal scherm te veel.
      De cursor wijst de plek aan maar wordt hierop afgekapt, anders vliegt hij
      het beeld half uit om bij een cursor tegen de rand te komen. */
  reachSide: number
  /** hoe snel hij de cursor zijwaarts volgt, per seconde. Laag geeft gewicht en
      laat hem achterlopen, en dat achterlopen is wat de kanteling voedt; hoog
      plakt hem aan de cursor en dan kantelt hij nauwelijks meer. */
  followRate: number
  /** hoe ver hij naar voren en achteren gaat, als deel van de halve
      beeldhoogte; zelfde reden als `reachSide` */
  reachAhead: number
  /**
   * Hoe hard een volle vleugelslag hem vooruit brengt, in wereldeenheden per
   * seconde. Vooruit gaat alléén hiermee: tussen twee slagen door schuift hij
   * niet op, en dat is waarom de zetjes te zien zijn.
   */
  beatThrust: number
  /**
   * Hoe snel hij achteruit zweeft, in wereldeenheden per seconde. Dit kost geen
   * slag — een vogel klapwiekt niet om achteruit te zakken, die laat zich
   * dragen — dus dit hoort traag en gelijkmatig te zijn, in tegenstelling tot
   * het schoksgewijze vooruit.
   */
  glideBack: number
  /** hoe dicht bij het doel hij het slaan staakt, in wereldeenheden. Zonder deze
      dode zone klappert hij tussen slaan en zweven. */
  arriveGap: number
  /** hoe snel het slaan aan- en uitgaat, per seconde. Laag laat de vleugels
      nazwaaien na aankomst; hoog schakelt hard en dan zie je de omslag. */
  beatRate: number
  /** hoeveel er van het zweven overblijft als hij op zijn plek hangt, in
      wereldeenheden. Ligt los over het volgen heen zodat hij nooit stilstaat. */
  driftAhead: number
  /** hoe snel dat zweven verloopt. Laag is traag en dragend; hoog wordt
      onrustig. */
  driftRate: number
  /** hoeveel het lijf meekantelt met het zijwaarts zweven, in graden op zijn
      snelst. Dit is wat zweven van glijden onderscheidt: een vleugel die naar
      rechts draagt heeft zijn neus ook een beetje naar rechts. Te veel en hij
      lijkt te sturen in plaats van te dragen. */
  bankAngle: number
  /** hoe snel het lijf die kanteling maakt, per seconde. Laag geeft gewicht;
      hoog en het klapt van stand naar stand in plaats van te kantelen. */
  bankRate: number
  /**
   * Hoeveel hij om zijn eigen lengteas rolt bij een zijwaartse haal, in graden
   * op zijn snelst.
   *
   * Dit is iets anders dan `bankAngle`, en de twee horen bij elkaar. Die draait
   * zijn neus de bocht in, gezien van bovenaf; deze legt hem in die bocht. De
   * camera kijkt recht naar beneden, dus je ziet het als een spanwijdte die
   * korter wordt en één vleugel die naar je toe komt. Zonder deze schuift een
   * draak met vaste vleugels over het beeld; met alleen deze hangt hij scheef
   * zonder ergens heen te gaan.
   */
  rollAngle: number
  /**
   * Hoe snel hij die rol maakt, per seconde.
   *
   * Sneller dan `bankRate`, want in de lucht gaat het rollen voor: je legt hem
   * eerst en de bocht volgt. Hier komen ze uit dezelfde gemeten snelheid, dus
   * echt vooruitlopen kan niet, maar een korter tijdconstante geeft wel diezelfde
   * volgorde te zien.
   */
  rollRate: number
  /**
   * Hoeveel hij naar de kant van de cursor hangt als hij er niet naartoe beweegt,
   * in graden.
   *
   * Klein houden. De rest van de draai komt van wat hij doet; dit is alleen het
   * verschil tussen een lijf dat toevallig de goede kant op staat en een lijf dat
   * weet waar je bent. Te veel en hij wordt een naald die naar je cursor wijst,
   * en dan is de kop die meedraait ook niets meer waard.
   */
  leanAngle: number
}

/**
 * De procedurele laag bovenop de animatieclip, zie pose.ts en rig.ts. Alleen
 * voor een model waarin de ketens gevonden worden; de bol en modellen zonder
 * skelet merken er niets van.
 */
export type PoseConfig = {
  /** uitslag van de staartpunt, in radialen per schakel */
  tailSway: number
  /** tempo van de golf door de staart, in radialen per seconde */
  tailRate: number
  /** hoeveel fase er over de hele staart staat; hoger geeft meer bochten
      tegelijk, op 0 slaat de hele staart als één stuk uit */
  tailWave: number
  /** hoe ver de kop naar de cursor draait, in radialen; 0 zet het uit */
  neckFollow: number
  /** hoe snel de kop die draai maakt, per seconde. Laag is loom en kijkt na,
      hoog plakt de kop aan de cursor en dan oogt het als een machine. */
  neckRate: number
  /**
   * Tot hoe ver om hem heen de cursor de kop nog stuurt, in radialen vanaf
   * recht vooruit.
   *
   * Hierbuiten kijkt hij zijn eigen kant op. Dat is niet alleen mooier maar ook
   * nodig: de hoek naar een doel recht achter hem klapt van +180° naar -180°, en
   * een kop die dat volgt zwiept in één keer de hele ronde om. Onder deze grens
   * blijven betekent nooit in de buurt van die omslag komen.
   */
  lookGive: number
  /**
   * Hoe ver hij uit zichzelf rondkijkt, in radialen.
   *
   * Wat er overblijft als jij niet in beeld bent of achter hem staat. Kleiner
   * dan `neckFollow`: rondkijken is iets anders dan iets aankijken.
   */
  gazeSweep: number
  /** hoe traag dat rondkijken gaat. Ruis en geen sinus, zodat er geen ronde in
      zit die je na een minuut terugziet. */
  gazeRate: number
  /**
   * Hoe ver de vleugels bewegen terwijl hij zweeft, in radialen aan de schouder.
   *
   * In de zweefstand staat de clip stil, en een stilstaande vleugel ziet er dood
   * uit. Een zwevende vogel corrigeert continu op wat de lucht doet, en dit is
   * die correctie. Klein houden: dit is geen slag maar een aanpassing.
   */
  soarLift: number
  /** hoe traag dat verloopt. Laag is dragend; hoog gaat op fladderen lijken. */
  soarRate: number
}

/**
 * Hoe de vleugelslag uit de beweging van de roerpunten gelezen wordt, zie
 * thrust.ts. Wat eruit komt is 0 tot 1 — hoeveel slag er nu in zit — en
 * `flight.beatBoost` maakt daar snelheid van.
 */
export type ThrustConfig = {
  /**
   * Hoe snel de draak de slag volgt, per seconde. Laag geeft hem gewicht en
   * laat hem achterlopen; hoog plakt hem op de slag en dan oogt het mechanisch.
   * Rond de slagfrequentie is een goed begin.
   */
  thrustResponse: number
  /** hoe snel de gemeten piek meezakt met de clip, zodat `beatBoost` niet aan
      dit model en deze clip vasthangt */
  thrustAdapt: number
  /**
   * Hoe scherp het verschil tussen zweven en slaan wordt uitvergroot, zie
   * beat.ts. De klok van de clip loopt dan ongelijkmatig: langzaam waar de
   * vleugels langzaam bewegen, snel waar ze snel bewegen. Op 0 loopt de clip
   * gelijkmatig zoals hij bedoeld is. De rondgang duurt even lang, alleen de
   * verdeling erbinnen verschuift.
   */
  glideHold: number
  /**
   * Over welk deel van de rondgang de clip afremt naar de zweefstand als de
   * vleugels niet hoeven te werken, zie beat.ts.
   *
   * De slag zelf houdt zijn eigen tempo: hij maakt de slag waar hij in zit gewoon
   * af en komt pas in de laatste aanloop tot stilstand, met de vleugels gespreid.
   * De hele clip vertragen zag eruit als doorklapwieken in slow motion, en dat is
   * niet hetzelfde als ophouden met slaan.
   *
   * Dit is meteen de tijdconstante van dat afremmen, als deel van de rondgang:
   * op 0,08 van een rondgang van 3,3 seconde staat hij binnen een kwart seconde
   * stil. Hoger en je ziet hem langzaam uitlopen.
   */
  soarBrake: number
}

/**
 * Wanneer je hem kwijt bent. Eén drempel, en die stuurt de duik: laat je de muis
 * met rust of haal je hem uit beeld, dan gaat hij weg, en hij komt terug zodra
 * je weer beweegt. Zie dive.ts voor wat er dan gebeurt.
 */
export type IdleConfig = {
  /** na hoeveel seconden zonder muisbeweging hij je opgeeft en duikt. Een cursor
      die het beeld uit is telt meteen als stilstaan */
  idleAfter: number
}

/**
 * De duik, zie dive.ts. Om de zoveel vleugelslagen laat hij zich vallen en komt
 * even later van opzij weer binnen.
 */
export type DiveConfig = {
  /** na hoeveel vleugelslagen hij duikt; op 0 duikt hij nooit */
  diveEvery: number
  /** de vaart waarmee de duik begint, in eenheden per seconde. Die had hij al
      uit zijn laatste slag, dus op nul beginnen zou een knik geven in plaats van
      een boog */
  diveSpeed: number
  /** hoe hard hij op gang komt tijdens het vallen, in eenheden per seconde per
      seconde. Een versnelling en geen vaste snelheid, want meteen op eindtempo
      leest als een lift in plaats van als loslaten */
  diveAcceleration: number
  /** hoe ver van de camera af hij moet zijn voordat hij als weg telt. De camera
      staat op zo'n 2,4 eenheden, dus op 12 is hij nog een vijfde van zijn
      grootte en roert hij vrijwel niets meer */
  diveDepth: number
  /** hoe lang de neus erover doet om van vlak naar recht omlaag te komen, in
      seconden. Geëgaliseerd, dus de kanteling zet zacht in en dooft zacht uit;
      hij loopt vóór op het wegvallen, want vlak wegzakken is geen duik */
  pitchTime: number
  /** over hoeveel eenheden diepte hij in de achtergrond oplost. De fog begint
      een eindje achter het vliegvlak, dus tijdens het gewone vliegen merk je er
      niets van; pas als hij wegduikt vervaagt hij */
  fogDepth: number
  /** hoe lang hij uit beeld blijft, in seconden */
  awayTime: number
  /** hoe snel hij van de zijkant weer naar binnen komt, per seconde */
  enterRate: number
  /** hoe dicht bij het midden hij moet zijn voordat de cursor het weer overneemt */
  enterGap: number
}

export type ObjectConfig = PursuitConfig &
  ShadingConfig &
  ThrustConfig &
  PoseConfig &
  FlightConfig &
  DiveConfig &
  IdleConfig & {
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
  /**
   * Hoe hard de lucht zelf met `windDirection` mee zakt, in schermhoogtes per
   * simulatieseconde. Op 0 hangt de nagloed stil waar hij gemaakt is.
   *
   * Dit staat los van de vleugelslag: die geeft de wind zijn richting, dit geeft
   * hem zijn tempo. Alleen de nagloed drijft mee, niet het snelheidsveld, dus
   * de oplosser merkt er niets van.
   */
  windSpeed: number
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

  /**
   * Hoeveel van het object er sowieso doorkomt, los van de stroming.
   *
   * De draak wordt onthuld door de vloeistof: waar het veld stilstaat is er
   * alleen achtergrond, en waar het hard waait komt hij door. Op de meeste
   * pixels zit hij daar ergens tussenin, en dat is precies de waas die je ziet —
   * geen laag eroverheen maar de achtergrond die door hem heen schijnt.
   *
   * Zolang dat het effect ís, hoort daar een knop op te zitten. Op 0 is het
   * zoals het altijd was: geen streek, geen draak. Op 1 staat hij er altijd
   * volledig en doet de stroming alleen nog de kleur eromheen. Ertussenin heb je
   * een draak die je kunt zien terwijl je stilstaat, maar die nog steeds oplicht
   * waar je langs hem veegt — en dat is waarschijnlijk waar je hem wilt hebben.
   */
  presence: number

  /**
   * Hoeveel gaten er in die aanwezigheid zitten, 0 tot 1.
   *
   * Op 0 komt hij overal even sterk door en is hij matglas: gelijkmatig half
   * doorzichtig, en dat leest als een technische instelling in plaats van als
   * iets. Hoger breekt ruis die bodem open, zodat hij op de ene plek vol staat
   * en op de andere vrijwel weg is.
   *
   * Dat is het verschil tussen mist en wolken. Mist is overal even dik; wolken
   * hebben randen, en juist aan die randen zie je dat er iets vóór hem langs
   * drijft in plaats van dat hij zelf vaag is.
   */
  presenceHoles: number
  /** hoe groot die gaten zijn. Klein maakt er vlokken van, groot maakt het een
      paar banken die traag over hem heen trekken. */
  presenceScale: number
  /** hoe hard ze langstrekken, in schermhoogtes per seconde. Trager dan de
      slierten houden: dit is de grote beweging, die is de fijne. */
  presenceDrift: number

  /**
   * Slierten lucht die met de wind langstrekken, zodat je door iets heen zweeft
   * in plaats van in het niets te hangen.
   *
   * Dit is een beeldlaag en geen vloeistof: de oplosser merkt er niets van. Het
   * moest ook wel buiten de nagloed blijven, want die buffer voedt zichzelf en
   * daar zou dit zich per frame opstapelen.
   */
  /** hoeveel van de sliertkleur er overheen komt op zijn dichtst. 0 zet ze uit */
  wispAmount: number
  /** de tint van een sliert. Moet genoeg van `background` verschillen om te
      zien: de doelachtergrond van het object scheelt maar 4% en dat is te
      weinig, ook op volle sterkte */
  wispColor: string
  /** hoe grof de slierten zijn; hoger is fijner en drukker */
  wispScale: number
  /** de drempel die er slierten van maakt in plaats van een deken: hoger laat
      alleen de toppen van de ruis door en dus meer leegte ertussen */
  wispGap: number
  /** hoe snel ze langstrekken, in schermhoogtes per seconde */
  wispSpeed: number
  /** hoe ver de stroming de mist meesleept. Dit is niet dezelfde vervorming als
      `warp`: die boog het beeld van het object krom, dit verschuift alleen waar
      de mist hangt */
  wispWarp: number
  /** hoe hard de stroming de mist wegblaast. Op 1 is een volle veeg precies
      genoeg om schoon te vegen, hoger maakt het spoor breder */
  wispClear: number
}

export type FluidSceneConfig = {
  /** achtergrond van de pagina */
  background: string
  /**
   * Wat een klik doet: een golf door het beeld, een nieuwe kleurfase, en een
   * stil object dat naar de cursor toe gestuurd wordt. Staat standaard uit, dus
   * de scene reageert alleen op beweging.
   *
   * De plek van de tik wordt los hiervan altijd onthouden, anders weet een
   * aanraakscherm nooit waar je zit.
   */
  clickImpulse: boolean

  /**
   * De draak kaal in beeld, zonder vloeistof eromheen.
   *
   * Geen effect maar een werkstand. Normaal wordt hij alleen onthuld waar de
   * stroming geweest is, en dat masker eet precies datgene op wat je wilt zien
   * als je aan zijn belichting zit te draaien: zachte schaduw, de glans op zijn
   * rug, de lijn om zijn silhouet. Hier staat hij plat op de achtergrond van zijn
   * eigen target — geen masker, geen tint, geen slierten, geen vervorming.
   *
   * De oplosser slaat dan ook over. Dat scheelt negen passes, maar vooral: het
   * maakt de proef zuiver. Zie je hier niets veranderen aan een knop, dan ligt
   * het aan de belichting en niet aan wat eroverheen ligt.
   */
  bareObject: boolean

  /**
   * Of hij mag wegduiken als je hem met rust laat.
   *
   * Ook een werkstand. Normaal is dat juist het punt — laat je hem staan, dan
   * duikt hij weg en komt hij pas terug als je weer beweegt. Maar zit je aan
   * zijn belichting, dan is dat precies verkeerd: je haalt je hand van de muis
   * om te kijken, en dan is hij weg.
   *
   * Uit betekent niet dat hij stilhangt. Ben je er niet, dan hangt hij om zijn
   * eigen dwaalpunt en vliegt hij gewoon door, zie pursuit.ts. Staat hij op dat
   * moment midden in een duik, dan maakt hij die af en komt hij terug.
   */
  diveEnabled: boolean
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
