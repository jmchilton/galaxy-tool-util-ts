/**
 * Copy tool-cache-proxy-ui's Vite build output into
 * packages/tool-cache-proxy/public/ so galaxy-tool-proxy can serve the SPA at
 * runtime from the same origin as the API.
 *
 * Build the UI first:
 *   pnpm --filter @galaxy-tool-util/tool-cache-proxy-ui build
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "../../tool-cache-proxy-ui/dist");
const destDir = join(__dirname, "../public");

if (!existsSync(join(srcDir, "index.html"))) {
  console.error(`Error: tool-cache-proxy-ui build output not found at ${srcDir}`);
  console.error("Build it first: pnpm --filter @galaxy-tool-util/tool-cache-proxy-ui build");
  process.exit(1);
}

if (existsSync(destDir)) {
  rmSync(destDir, { recursive: true });
}

cpSync(srcDir, destDir, { recursive: true });
console.log(`Copied tool-cache-proxy-ui dist → public/`);
