import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".webpack/**",
      "out/**",
      "node_modules/**",
      "coverage/**",
      "eslint.config.mjs",
      "scripts/**/*.d.mts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        AbortSignal: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
);
