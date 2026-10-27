import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "playwright-report/**", "test-results/**", "examples/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
