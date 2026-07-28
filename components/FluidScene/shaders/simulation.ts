/**
 * De vloeistofstap. Eén buffer houdt het hele veld vast:
 *   rg = snelheid, b = achtergebleven inkt.
 *
 * Het is bewust geen echte Navier-Stokes-oplosser: er is geen drukstap. Het
 * veld sleept zichzelf mee, dooft uit, en wordt aangedreven door penselen.
 * Dat is precies wat je nodig hebt voor een verfachtige veeg, en het scheelt
 * de helft van de passes.
 *
 * NB_INPUTS wordt bij het maken van het materiaal ingevuld: één penseel voor
 * de cursor plus één per roerpunt van het object.
 */
export const simulationFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uPrevious;
  uniform float uDelta;
  uniform float uAspect;
  uniform float uVelocityDamping;
  uniform float uInkDamping;
  uniform float uAdvection;
  uniform float uMaxSpeed;
  uniform float uInkDeposit;

  uniform vec2 uCenter[NB_INPUTS];
  uniform vec2 uLastCenter[NB_INPUTS];
  uniform vec2 uForce[NB_INPUTS];
  uniform float uRadius[NB_INPUTS];
  uniform float uStrength[NB_INPUTS];

  uniform vec2 uShockwaveCenter;
  uniform float uShockwaveProgress;
  uniform float uShockwaveRadius;
  uniform float uShockwaveStrength;

  /* uv is niet vierkant; hierin gerekend blijven penselen rond */
  vec2 aspected(vec2 point) {
    return vec2(point.x * uAspect, point.y);
  }

  float distanceToSegment(vec2 point, vec2 a, vec2 b) {
    vec2 pa = point - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  /* Een vers aangemaakte half-float buffer is niet leeg maar ongedefinieerd,
     en die rommel kan NaN zijn. Eén NaN in het snelheidsveld maakt de
     uitleescoördinaat hieronder ook NaN, en dan levert elke uitlezing nul op:
     het veld stapelt dan nooit op en je ziet alleen de stempel van dit frame.
     NaN faalt elke vergelijking, dus dit vangt hem. */
  vec3 sanitize(vec3 value) {
    return dot(value, value) < 1e6 ? value : vec3(0.0);
  }

  void main() {
    vec3 previous = sanitize(texture2D(uPrevious, vUv).rgb);

    /* 1. advectie: het veld sleept zichzelf mee */
    vec2 source = clamp(vUv - previous.xy * uDelta * uAdvection, 0.0, 1.0);
    vec3 field = sanitize(texture2D(uPrevious, source).rgb);

    /* 2. uitdemping, uitgedrukt per seconde zodat framerate niet meetelt */
    field.xy *= exp(-uVelocityDamping * uDelta);
    field.z *= exp(-uInkDamping * uDelta);

    /* 3. penselen: het pad tussen vorige en huidige positie als capsule */
    vec2 point = aspected(vUv);
    for (int i = 0; i < NB_INPUTS; i++) {
      float strength = uStrength[i];
      if (strength <= 0.0) continue;

      float distance = distanceToSegment(point, aspected(uLastCenter[i]), aspected(uCenter[i]));
      float falloff = 1.0 - smoothstep(0.0, uRadius[i], distance);
      if (falloff <= 0.0) continue;

      /* snelheid uit de verplaatsing van het penseel */
      field.xy += uForce[i] * falloff * strength;
      /* inkt uit aanwezigheid: een object dat er is, kleurt de vloeistof,
         ook als het bijna stilstaat. Zonder dit is het effect vrijwel
         onzichtbaar, want de verplaatsing per frame is minuscuul. */
      field.z += falloff * strength * uInkDeposit * uDelta;
    }

    /* 4. schokgolf van een klik: een ring die naar buiten loopt en uitdooft */
    if (uShockwaveProgress >= 0.0) {
      vec2 offset = aspected(vUv - uShockwaveCenter);
      float distance = length(offset);
      float radius = uShockwaveProgress * uShockwaveRadius;
      float ring = exp(-pow((distance - radius) / 0.04, 2.0));
      float fade = 1.0 - uShockwaveProgress;

      field.xy += normalize(offset + 1e-5) * ring * uShockwaveStrength * fade;
      field.z += ring * fade * 0.5;
    }

    /* 5. plafond, anders loopt het veld weg bij snelle bewegingen */
    float speed = length(field.xy);
    if (speed > uMaxSpeed) field.xy *= uMaxSpeed / speed;
    field.z = clamp(field.z, 0.0, 1.0);

    gl_FragColor = vec4(field, 1.0);
  }
`
