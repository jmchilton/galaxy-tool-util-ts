#!/usr/bin/env node
// Copies the extension-host iframe HTML from @codingame/monaco-vscode-extensions-service-override
// into public/monaco/. The override's exports map does not permit deep .html imports, so we
// stage a copy that Vite can serve at /monaco/webWorkerExtensionHostIframe.html.
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const require = createRequire(import.meta.url);

// The override's exports map blocks package.json resolution. Resolve the
// package main (index.js) and walk to the package root from there.
const overrideEntry = require.resolve("@codingame/monaco-vscode-extensions-service-override");
const src = resolve(
  dirname(overrideEntry),
  "vscode/src/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html",
);
if (!existsSync(src)) {
  console.error(`[copy-monaco-iframe] source not found: ${src}`);
  process.exit(1);
}

const destDir = resolve(pkgRoot, "public/monaco");
mkdirSync(destDir, { recursive: true });
const dest = resolve(destDir, "webWorkerExtensionHostIframe.html");
copyFileSync(src, dest);

// The upstream iframe ships a meta CSP that omits `blob:` from connect-src.
// The extension host worker inside this iframe fetches extension resources
// (manifest, contributed schemas) via Blob URLs produced by the vsix loader,
// which the stock CSP blocks. Patch in `blob:` so those fetches succeed.
const html = readFileSync(dest, "utf8");
const patched = html.replace(/(connect-src\s+'self')/, "$1 blob:");
if (patched === html) {
  console.warn(`[copy-monaco-iframe] connect-src 'self' not found in ${dest}; CSP not patched`);
} else {
  writeFileSync(dest, patched);
}
console.log(`[copy-monaco-iframe] ${dest}`);
