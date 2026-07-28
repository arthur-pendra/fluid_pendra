/**
 * Pass 3, 4 en 5: de drukprojectie.
 *
 * Dit is het deel dat een vloeistof een vloeistof maakt. Na advectie en de
 * penselen is het snelheidsveld niet divergentievrij: er ontstaan plekken waar
 * meer in dan uit stroomt. Zonder correctie krijg je uitdijende vlekken in
 * plaats van wervels.
 *
 * De correctie gaat in drie stappen: meet de divergentie, los daar een
 * drukveld bij op met een handvol Jacobi-iteraties, en trek de gradiënt van
 * die druk van de snelheid af.
 */

const NEIGHBOURS = /* glsl */ `
  vec2 clampUv(vec2 uv, vec2 texel) {
    return clamp(uv, texel, 1.0 - texel);
  }
`

/** meet hoeveel het veld per punt uit elkaar loopt */
export const divergenceFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  uniform float uDelta;

  ${NEIGHBOURS}

  void main() {
    float left = texture2D(uVelocity, clampUv(vUv - vec2(uTexel.x, 0.0), uTexel)).x;
    float right = texture2D(uVelocity, clampUv(vUv + vec2(uTexel.x, 0.0), uTexel)).x;
    float down = texture2D(uVelocity, clampUv(vUv - vec2(0.0, uTexel.y), uTexel)).y;
    float up = texture2D(uVelocity, clampUv(vUv + vec2(0.0, uTexel.y), uTexel)).y;

    float divergence = (right - left + up - down) / 2.0;

    gl_FragColor = vec4(divergence / uDelta);
  }
`

/** één Jacobi-iteratie richting het drukveld */
export const pressureFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 uTexel;

  ${NEIGHBOURS}

  void main() {
    vec2 step = uTexel * 2.0;
    float p0 = texture2D(uPressure, clampUv(vUv + vec2(step.x, 0.0), uTexel)).r;
    float p1 = texture2D(uPressure, clampUv(vUv - vec2(step.x, 0.0), uTexel)).r;
    float p2 = texture2D(uPressure, clampUv(vUv + vec2(0.0, step.y), uTexel)).r;
    float p3 = texture2D(uPressure, clampUv(vUv - vec2(0.0, step.y), uTexel)).r;
    float divergence = texture2D(uDivergence, vUv).r;

    gl_FragColor = vec4((p0 + p1 + p2 + p3) / 4.0 - divergence);
  }
`

/** trek de drukgradiënt van de snelheid af; wat overblijft is wervelend */
export const gradientSubtractFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  uniform float uDelta;

  ${NEIGHBOURS}

  void main() {
    float p0 = texture2D(uPressure, clampUv(vUv + vec2(uTexel.x, 0.0), uTexel)).r;
    float p1 = texture2D(uPressure, clampUv(vUv - vec2(uTexel.x, 0.0), uTexel)).r;
    float p2 = texture2D(uPressure, clampUv(vUv + vec2(0.0, uTexel.y), uTexel)).r;
    float p3 = texture2D(uPressure, clampUv(vUv - vec2(0.0, uTexel.y), uTexel)).r;

    vec3 field = texture2D(uVelocity, vUv).xyz;
    vec2 gradient = vec2(p0 - p1, p2 - p3) * 0.5;

    gl_FragColor = vec4(field.xy - gradient * uDelta, field.z, 1.0);
  }
`
