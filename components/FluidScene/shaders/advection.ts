/**
 * Pass 1 van de oplosser: advectie.
 *
 * Het veld sleept zichzelf mee, maar niet met een enkele stap terug: er wordt
 * heen en weer gestapt en de fout daartussen wordt gehalveerd teruggerekend
 * (BFECC). Dat houdt wervels scherp, want een enkele stap smeert ze uit.
 *
 * Daar bovenop stuurt ruis de stroming. Waar de snelheid onder een
 * ruisafhankelijke drempel zakt, valt de stroming deels weg (de gaten) en
 * krijgt wat overblijft juist een zetje in een ruisrichting. Dat is wat de
 * vloeistof zijn grillige, geaderde karakter geeft in plaats van gladde
 * concentrische ringen.
 */
export const advectionFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uVelocity;
  uniform sampler2D uNoise;
  uniform float uDelta;
  uniform float uDeceleration;
  uniform float uRandomDirection;
  uniform float uFirstNoiseScale;
  uniform float uSecondNoiseScale;
  uniform float uVelocityThreshold;
  uniform float uGapVelocityBoost;
  uniform vec2 uGapAmount;

  float cubicInOut(float t) {
    return t < 0.5 ? 4.0 * t * t * t : 0.5 * pow(2.0 * t - 2.0, 3.0) + 1.0;
  }

  vec2 sampleVelocity(vec2 uv) {
    return texture2D(uVelocity, clamp(uv, 0.0, 1.0)).xy;
  }

  void main() {
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    float speed = length(velocity);

    vec3 noise = texture2D(uNoise, vUv * uFirstNoiseScale).rgb;
    vec3 fineNoise = texture2D(uNoise, vUv * uSecondNoiseScale).rgb;
    vec2 noiseDirection = normalize((noise.gb - 0.5) * 2.0);

    /* onder de drempel valt de stroming in gaten uiteen */
    bool inGap = speed < cubicInOut(noise.r) * uVelocityThreshold;
    if (inGap) velocity *= smoothstep(uGapAmount.x, uGapAmount.y, fineNoise.r);

    vec2 offset = mix(velocity, noiseDirection * length(velocity), uRandomDirection) * uDelta;
    if (inGap) offset *= mix(0.0, uGapVelocityBoost, noise.r);

    /* stap terug, dan heen, en corrigeer met de helft van de fout */
    vec2 stepped = sampleVelocity(vUv - offset) * fineNoise.r * 3.0;
    vec2 back = vUv - stepped * uDelta;

    vec2 returned = sampleVelocity(back) * fineNoise.r * 2.0;
    vec2 forward = back + returned * uDelta;
    vec2 corrected = vUv - (forward - vUv) * 0.5;

    vec2 settled = sampleVelocity(corrected) * fineNoise.r;
    vec2 result = sampleVelocity(corrected - settled * uDelta);

    gl_FragColor = vec4(result * uDeceleration, 0.0, 0.0);
  }
`
