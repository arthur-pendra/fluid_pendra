/**
 * Pass 2: de penselen die kracht in het veld zetten.
 *
 * Elk penseel is geen punt maar een capsule tussen zijn vorige en huidige
 * positie, met aan beide uiteinden een eigen straal. Daardoor blijft een snel
 * bewegende cursor een doorlopende streek in plaats van een reeks losse
 * stippen. Groeit of krimpt het penseel harder dan het beweegt, dan wordt het
 * een cirkel: een capsule klopt dan niet meer.
 *
 * Een klik zet `circular` op de verstreken tijd, en zolang die onder de duur
 * blijft schrijft het penseel een naar buiten lopende golf in plaats van een
 * duw in de bewegingsrichting.
 *
 * NB_INPUTS wordt bij het maken van het materiaal ingevuld.
 */
export const externalForceFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uPrevious;
  uniform vec2 uForce[NB_INPUTS];
  uniform vec2 uCenter[NB_INPUTS];
  uniform vec2 uLastCenter[NB_INPUTS];
  uniform float uScale[NB_INPUTS];
  uniform float uLastScale[NB_INPUTS];
  uniform float uIntensity[NB_INPUTS];
  uniform float uCircular[NB_INPUTS];

  float clampedRemap(float value, float start1, float stop1, float start2, float stop2) {
    float r = start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
    return clamp(r, min(start2, stop2), max(start2, stop2));
  }

  float cross2(vec2 a, vec2 b) {
    return a.x * b.y - a.y * b.x;
  }

  /* afstandsveld van een capsule met twee verschillende stralen */
  float unevenCapsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
    p -= a;
    b -= a;
    float h = dot(b, b);
    vec2 q = vec2(dot(p, vec2(b.y, -b.x)), dot(p, b)) / h;
    q.x = abs(q.x);
    float delta = ra - rb;
    vec2 c = vec2(sqrt(h - delta * delta), delta);
    float k = cross2(c, q);
    float m = dot(c, q);
    float n = dot(q, q);
    if (k < 0.0) return sqrt(h * n) - ra;
    if (k > c.x) return sqrt(h * (n + 1.0 - 2.0 * q.y)) - rb;
    return m - ra;
  }

  float circleField(vec2 position, float radius, float blurriness) {
    return smoothstep(
      radius - radius * blurriness,
      radius + radius * blurriness,
      dot(position, position) * 4.0
    );
  }

  void main() {
    vec3 previous = texture2D(uPrevious, vUv).xyz;
    vec2 addedVelocity = vec2(0.0);
    float addedIntensity = 0.0;

    for (int i = 0; i < NB_INPUTS; i++) {
      vec2 force = uForce[i];
      vec2 center = uCenter[i];
      vec2 lastCenter = uLastCenter[i];
      float scale = uScale[i];
      float lastScale = uLastScale[i];

      /* Buiten het bereik van dit penseel valt er niets te doen, en dat is voor
         verreweg de meeste pixels het geval: een penseel beslaat een schijfje
         van een paar procent van de buffer, en deze lus draait over alle
         penselen voor élke pixel. De capsule past altijd binnen een cirkel om
         het midden van zijn segment, dus dit is een veilige ondergrens en geen
         benadering: elke pixel die hierna nog vorm zou krijgen komt er doorheen.

         Niet bij een schokgolf: die schrijft een ring die veel verder reikt dan
         de capsule, dus daar mag niet overgeslagen worden. */
      if (uCircular[i] <= 0.0) {
        float reach = length(center - lastCenter) * 0.5 + max(lastScale, scale);
        vec2 toMiddle = vUv - (lastCenter + center) * 0.5;
        if (dot(toMiddle, toMiddle) > reach * reach) continue;
      }

      float forceLength = length(force);

      /* groeit of krimpt het penseel sneller dan het beweegt, dan is een
         cirkel de juiste vorm en geen capsule */
      float useCircle = 0.0;
      float circleRadius = 0.0;
      vec2 circleCenter = vec2(0.0);
      float travelled = length(lastCenter - center);
      if (lastScale - scale > travelled) {
        circleRadius = lastScale;
        circleCenter = lastCenter;
        useCircle = 1.0;
      }
      if (scale - lastScale > travelled) {
        circleRadius = scale;
        circleCenter = center;
        useCircle = 1.0;
      }

      float shape = mix(
        unevenCapsule(vUv, lastCenter, center, lastScale, scale),
        length(vUv - circleCenter) - circleRadius,
        useCircle
      );
      shape = max(0.0, -shape / max(lastScale, scale));

      float writes = step(0.0001, shape) * step(0.0001, forceLength);
      float intensity = mix(previous.z, min(previous.z + uIntensity[i], 1.0), writes);

      vec2 outward = normalize((vUv - center) / scale) * forceLength;
      vec2 velocity;

      float circular = uCircular[i];
      if (circular > 0.0 && circular < 0.7) {
        /* schokgolf: een ring die naar buiten loopt en onderweg uitdooft */
        float progress = clampedRemap(circular, 0.0, 1.0, 0.0, 1.0);
        vec2 direction = normalize(vUv - center);
        float distance = circleField(vUv - center, 0.015, 2.0);

        float depth = cos(distance * 15.0 - progress * 10.0);
        if (distance > 1.0) {
          depth = 0.0;
        } else {
          depth *= 1.0 - distance;
        }
        depth *= 1.0 - progress;
        depth *= smoothstep(1.0 - progress * 3.0, 1.0, 1.0 - distance);
        depth *= smoothstep(0.0, progress, distance);

        shape = depth;
        velocity = direction * depth * 4.0;
      } else {
        velocity = mix(force, outward, 0.2) * shape;
      }

      addedVelocity = mix(addedVelocity, velocity, shape);
      addedIntensity = mix(addedIntensity, intensity, shape);
    }

    gl_FragColor = vec4(previous.xy + addedVelocity, addedIntensity, 1.0);
  }
`
