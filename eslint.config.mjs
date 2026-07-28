import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // De WebGL-laag muteert per frame three.js-objecten en losse
    // frame-toestand: camera's, materialen, uniforms, penselen, cursorstand.
    // Dat is geen React-state en veroorzaakt geen renders, maar de
    // immutability-regel van de React Compiler ziet dat verschil niet. Alleen
    // die ene regel staat hier uit; de rest van de hook-regels blijft aan.
    files: ['components/FluidScene/**/*.{ts,tsx}'],
    rules: { 'react-hooks/immutability': 'off' },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
