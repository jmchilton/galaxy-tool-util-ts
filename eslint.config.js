import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/*/src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: [
      "packages/core/src/node.ts",
      "packages/core/src/config-node.ts",
      "packages/core/src/cache/node.ts",
      "packages/core/src/cache/storage/filesystem.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "fs",
                "fs/promises",
                "os",
                "path",
                "child_process",
                "http",
                "https",
                "stream",
                "url",
              ],
              message:
                "Universal core entry must stay browser-safe. Put Node code under src/node.ts, src/config-node.ts, or src/cache/node.ts.",
            },
          ],
        },
      ],
    },
  },
);
