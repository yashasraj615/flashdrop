import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Upstream React Bits Ballpit is retained with its original loose Three.js typing.
    // Scope these allowances to the vendor file; application code stays type checked.
    files: ["components/react-bits/ballpit.tsx"],
    rules: {"@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/ban-ts-comment": "off"},
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".vercel/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
