#!/usr/bin/env node
/**
 * Bundles `dist/index.js` with esbuild targeting the browser, then asserts no
 * Node built-ins survived in the bundle. Catches regressions where a top-level
 * `node:*` import sneaks back into the universal entry.
 */
import { build } from "esbuild";

const NODE_MODULE_RE = /^node:|(^|\/)node_modules\/(fs|path|os|crypto|url|child_process|http|https|stream)(\/|$)/;

const result = await build({
  entryPoints: ["dist/index.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  metafile: true,
  logLevel: "silent",
}).catch((err) => {
  console.error("esbuild failed:");
  console.error(err.message);
  process.exit(1);
});

const leaks = Object.keys(result.metafile.inputs).filter((k) => NODE_MODULE_RE.test(k));

if (leaks.length > 0) {
  console.error("Node built-ins leaked into browser bundle:");
  for (const leak of leaks) console.error(`  ${leak}`);
  process.exit(1);
}

console.log(`OK — browser bundle clean (${Object.keys(result.metafile.inputs).length} inputs).`);
