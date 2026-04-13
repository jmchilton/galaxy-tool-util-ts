import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/**/*.browser.test.ts", "node_modules/**"],
    globals: false,
  },
});
