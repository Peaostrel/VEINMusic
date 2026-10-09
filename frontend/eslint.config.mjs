import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    languageOptions: {
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: [
      "app/**/*.ts",
      "app/**/*.tsx",
      "components/**/*.ts",
      "components/**/*.tsx",
      "utils/**/*.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { "@typescript-eslint/no-floating-promises": "error" },
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
