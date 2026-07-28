/**
 * Pass 6: de nagloed.
 *
 * Het snelheidsveld zelf zakt snel in. Deze buffer onthoudt waar het veld
 * geweest is en laat dat langzaam wegsterven, zodat een streek blijft staan
 * nadat de stroming er al uit is. Dit is de textuur die uiteindelijk getekend
 * wordt, niet het snelheidsveld.
 *
 *   rg  de laatst bekende richting, die blijft staan als de stroming wegvalt
 *   b   hoe sterk er hier nog iets is, gedempt met de attenuatie
 *   a   opgebouwde intensiteit uit de penselen
 */
export const accumulationFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uVelocity;
  uniform sampler2D uAccumulation;
  uniform float uAttenuation;

  void main() {
    vec4 current = texture2D(uVelocity, vUv);
    vec2 direction = current.xy;
    float speed = length(direction);
    float intensity = current.z;

    vec4 previous = texture2D(uAccumulation, vUv);
    float faded = previous.b * uAttenuation;

    gl_FragColor = vec4(
      speed > 0.001 ? direction : previous.rg,
      max(smoothstep(speed, 0.0, 0.01), faded),
      intensity
    );
  }
`
