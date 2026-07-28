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
  uniform float uTintAmount;
  uniform float uWarp;
  uniform float uRippleStrength;

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

    vec3 revealed = object + tint * uTintAmount;
    vec3 color = mix(uBackground, mix(uBackground, revealed, amount), uReveal);

    gl_FragColor = vec4(linearToSRGB(color), 1.0);
  }
`
