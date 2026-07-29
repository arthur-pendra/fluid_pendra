/**
 * De eindpass. Het object staat in een eigen render target op een vlakke
 * achtergrond; deze shader onthult dat beeld daar waar de vloeistof geweest
 * is, en buigt de uv mee met het veld. Vandaar de zachte, waterige veeg
 * zonder dat er ergens water in de scene staat.
 *
 * Twee dingen om te weten:
 *
 * De simulatie is vierkant en het scherm niet, dus de uv wordt eerst passend
 * gemaakt rond het midden. Zonder die stap wordt de vloeistof uitgerekt.
 *
 * De achtergrond van de render target is net iets donkerder dan die van de
 * pagina. Daardoor kleurt geroerd maar leeg gebied heel licht bij, en zie je
 * je streek ook waar het object niet is.
 *
 * Er wordt in lineaire ruimte gerekend en pas op de laatste regel naar sRGB
 * omgezet: de renderer doet dat niet voor een eigen ShaderMaterial.
 */
export const paintingFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uSimulation;
  uniform sampler2D uObject;
  uniform float uBare;
  uniform vec3 uBackground;
  uniform vec3 uPaletteA;
  uniform vec3 uPaletteB;
  uniform vec3 uPaletteC;
  uniform vec3 uPaletteD;
  uniform vec2 uResolution;
  uniform vec2 uShockwaveCenter;
  uniform float uShockwaveProgress;
  uniform float uRatio;
  uniform float uReveal;
  uniform float uPresence;
  uniform float uPresenceHoles;
  uniform float uPresenceScale;
  uniform vec2 uPresenceOffset;
  uniform float uTintAmount;
  uniform float uWarp;
  uniform float uRippleStrength;
  uniform sampler2D uNoise;
  uniform vec2 uWispOffset;
  uniform float uWispScale;
  uniform float uWispAmount;
  uniform float uWispGap;
  uniform vec3 uWispColor;
  uniform float uWispWarp;
  uniform float uWispClear;

  vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.283185 * (c * t + d));
  }

  float circleField(vec2 position, float radius, float blurriness) {
    return smoothstep(
      radius - radius * blurriness,
      radius + radius * blurriness,
      dot(position, position) * 4.0
    );
  }

  vec3 linearToSRGB(vec3 color) {
    vec3 low = color * 12.92;
    vec3 high = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), color));
  }

  void main() {
    /* vierkante simulatie naar een niet-vierkant scherm */
    vec2 simulationUv = vec2(vUv.x, 1.0 - vUv.y) - 0.5;
    if (uRatio > 1.0) {
      simulationUv.y /= uRatio;
    } else {
      simulationUv.x *= uRatio;
    }
    simulationUv += 0.5;

    vec4 data = texture2D(uSimulation, simulationUv);
    vec2 velocity = data.xy;
    /* begrenzen is nodig: zonder dat extrapoleert de menging hieronder voorbij
       de kleuren zelf en slaat het beeld door naar zwart */
    float amount = clamp(length(velocity), 0.0, 1.0);
    float eased = smoothstep(0.0, 1.0, amount);

    /* de rimpel van een klik, als een ring die naar buiten loopt */
    vec2 center = uShockwaveCenter * -0.5;
    center.x *= uRatio;
    vec2 screenUv = gl_FragCoord.xy / uResolution - 0.5;
    screenUv.x *= uRatio;

    float distance = circleField(screenUv + center, 0.015, 2.0);
    float depth = cos(distance * 15.0 - uShockwaveProgress * 10.0);
    if (distance > 1.0) {
      depth = 0.0;
    } else {
      depth *= 1.0 - distance;
    }
    depth *= 1.0 - uShockwaveProgress;
    depth *= smoothstep(1.0 - uShockwaveProgress * 3.0, 1.0, 1.0 - distance);
    depth *= smoothstep(0.0, uShockwaveProgress, distance);

    /* het object bekijken door het veld heen, plus de rimpel */
    vec2 warped = (vUv + velocity * uWarp) + abs(normalize(screenUv)) * depth * uRippleStrength;
    vec3 object = texture2D(uObject, warped).rgb;

    vec3 tint = palette(
      smoothstep(0.0, 1.0, length(vUv - 0.5)) + eased,
      uPaletteA, uPaletteB, uPaletteC, uPaletteD
    );

    /* Slierten lucht die langstrekken. Bewust hier en niet in de nagloed: die
       buffer voedt zichzelf, dus daar zou dit zich per frame opstapelen, en het
       zou blijven staan waar het geschreven is in plaats van mee te scrollen.
       Hier wordt het elk frame vers gelezen en raakt het de oplosser niet.

       De drempel verderop is wat er slierten van maakt in plaats van een deken:
       alleen de toppen van de ruis komen erdoor, de rest blijft leeg.

       De uv leest de stroming mee, en daarmee reageert de mist vanzelf op zowel
       de cursor als de draak, want allebei staan ze al in dat veld. Meeslepen is
       iets anders dan de vervorming die op het object zat: die boog het beeld
       van de draak zelf krom en oogde als water, dit verschuift alleen waar de
       mist hangt, zoals lucht die opzij geduwd wordt. Vóór het schalen opgeteld,
       zodat de grofheid van de ruis de sterkte van het slepen niet verandert. */
    vec2 wispUv = (screenUv + velocity * uWispWarp) * uWispScale + uWispOffset;

    float cloud = texture2D(uNoise, wispUv).r;
    float wisp = smoothstep(uWispGap, 1.0, cloud) * uWispAmount;

    /* en waar het hard waait blaast het de mist weg: de draak trekt een schoon
       spoor door de wolken en je cursor veegt ze open */
    wisp *= 1.0 - clamp(amount * uWispClear, 0.0, 1.0);

    vec3 revealed = object + tint * uTintAmount;

    /* Hoeveel van hem er doorkomt: wat de stroming onthult, plus wat er sowieso
       staat. Zonder dat tweede deel wordt hij overal met de achtergrond gemengd
       waar het veld zwak is, en dat is de waas die je niet weg kon krijgen —
       want die zat niet in een laag maar in dit mengsel.

       Die bodem is niet overal even dik. Ruis breekt hem open, en dat is het
       verschil tussen mist en wolken: mist is overal hetzelfde, wolken hebben
       randen. Aan die randen zie je dat er iets vóór hem langs drijft in plaats
       van dat hij zelf vaag is.

       Een andere plek in het ruisveld dan de slierten, en op een ander kanaal.
       Lazen ze hetzelfde, dan zouden de gaten precies op de flarden vallen en
       viel het samen tot één laag in plaats van twee. */
    /* De verschuiving vóór het schalen en niet erna. Dat lijkt een detail maar
       het bepaalt wat de knop betekent: erna gaat de echte snelheid op het
       scherm door de schaal heen, dus grotere wolken zouden vanzelf trager
       drijven. Zo staat presenceDrift in schermhoogtes per seconde en blijft
       dat zo, hoe groot je de banken ook maakt. */
    vec2 cloudUv = (screenUv + uPresenceOffset) * uPresenceScale + vec2(17.3, 4.1);
    float bank = texture2D(uNoise, cloudUv).g;

    /* rond het midden opengebroken, zodat de gaten en de dichte plekken elkaar
       in evenwicht houden en de knop blijft betekenen wat hij zegt */
    float holes = 1.0 + (bank - 0.5) * 2.0 * uPresenceHoles;

    float show = clamp(amount + uPresence * clamp(holes, 0.0, 2.0), 0.0, 1.0);
    vec3 color = mix(uBackground, mix(uBackground, revealed, show), uReveal);

    /* De sliert legt zijn eigen vleug over het beeld in plaats van het object te
       onthullen. Dat is met opzet: onthullen werkt alleen waar het object staat,
       en in lege lucht scheelt de doelachtergrond zo weinig van de pagina dat je
       er niets van ziet zonder de draak meteen een permanente schim te maken.
       Zo trekt de sliert overal langs, en waar hij over de draak gaat wast hij
       hem een beetje weg, zoals damp die voor je langs drijft. */
    color = mix(color, uWispColor, wisp * uReveal);

    /* De kale werkstand, zie types.ts. Met de rauwe uv en niet de gebogen: geen
       masker, geen tint, geen slierten en geen vervorming — alleen de draak
       zoals hij uit zijn eigen target komt. */
    color = mix(color, texture2D(uObject, vUv).rgb, uBare);

    gl_FragColor = vec4(linearToSRGB(color), 1.0);
  }
`
