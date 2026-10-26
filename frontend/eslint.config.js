import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/", "test-results/", "playwright-report/", "static/"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.{1,2}(/|$)",
              message: 'Use the "~/" alias (src/) instead of a relative path.',
            },
          ],
        },
      ],
    },
  },
]);
