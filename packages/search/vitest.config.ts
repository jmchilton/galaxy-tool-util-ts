import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**"],
    globals: false,
  },
});
