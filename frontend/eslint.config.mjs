import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The imported design system is vendored source, not app code — it is
    // linted by its own toolchain and must not be edited to satisfy ours.
    "design/**",
  ]),
]);

export default eslintConfig;
