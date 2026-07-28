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
 *
 * `uDrift` laat de hele nagloed meedrijven met de wind, zodat je door de lucht
 * zakt in plaats van erin stil te hangen. Het vorige beeld wordt bovenwinds
 * opgehaald, en dan schuift het beeld dus de andere kant op. Alleen hier en niet
 * in het snelheidsveld: dit is wat je ziet, en de oplosser blijft onaangeraakt.
 *
 * Waar de stroming nu nog actief is wint die het van het opgehaalde beeld, dus
 * het spoor wordt gemaakt waar de draak is en gaat pas drijven zodra hij weg is.
 */
export const accumulationFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uVelocity;
  uniform sampler2D uAccumulation;
  uniform float uAttenuation;
  uniform vec2 uDrift;

  void main() {
    vec4 current = texture2D(uVelocity, vUv);
    vec2 direction = current.xy;
    float speed = length(direction);
    float intensity = current.z;

    /* bovenwinds ophalen, dus het beeld schuift met de wind mee. Buiten de rand
       klemt de sampler vast op de rand zelf, en die is leeg, dus er waait niets
       ongewenst binnen. */
    vec4 previous = texture2D(uAccumulation, clamp(vUv - uDrift, 0.0, 1.0));
    float faded = previous.b * uAttenuation;

    gl_FragColor = vec4(
      speed > 0.001 ? direction : previous.rg,
      max(smoothstep(speed, 0.0, 0.01), faded),
      intensity
    );
  }
`
