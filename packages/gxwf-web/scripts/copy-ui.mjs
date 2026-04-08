/**
 * Copy gxwf-ui's Vite build output into packages/gxwf-web/public/ so that
 * gxwf-web can serve the frontend at runtime from the same origin as the API.
 *
 * Expects gxwf-ui to already be built. If dist/ is missing, prints a hint and
 * exits non-zero. Build it first with:
 *   pnpm --filter @galaxy-tool-util/gxwf-ui build
 *
 * Wired into: "build": "node scripts/copy-ui.mjs && tsc"
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "../../gxwf-ui/dist");
const destDir = join(__dirname, "../public");

if (!existsSync(join(srcDir, "index.html"))) {
  console.error(`Error: gxwf-ui build output not found at ${srcDir}`);
  console.error("Build it first: pnpm --filter @galaxy-tool-util/gxwf-ui build");
  process.exit(1);
}

if (existsSync(destDir)) {
  rmSync(destDir, { recursive: true });
}

cpSync(srcDir, destDir, { recursive: true });
console.log(`Copied gxwf-ui dist → public/`);
