/**
 * Vertex shader voor de schermvullende passes. De geometrie is een vlak van
 * 2 bij 2, dus de posities liggen al in clipruimte en er is geen camera nodig.
 */
export const fullscreenVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`
