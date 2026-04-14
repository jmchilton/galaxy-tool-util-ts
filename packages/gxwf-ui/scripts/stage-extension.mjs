#!/usr/bin/env node
// Stages a local galaxy-workflows-vscode .vsix by unzipping it from
// packages/gxwf-ui/fixtures/ into public/ext/galaxy-workflows/ so Vite (and
// gxwf-web's static serving) can surface each file at a stable HTTP URL.
// Intended to be run as a prebuild/predev hook.
//
// This is an opt-in, no-CI flow: a contributor drops a .vsix into fixtures/
// (gitignored), sets VITE_GXWF_MONACO=1 + VITE_GXWF_EXT_SOURCE=vsix:/ext/galaxy-workflows
// in .env.local, and rebuilds. Absent fixture → script is a no-op so default
// builds are unaffected.
//
// The in-browser loader treats both `folder:` and `vsix:` as "a directory of
// files reachable over HTTP" — no blob URLs, no runtime unzip, no cross-
// context fetches. Production deploys are expected to unpack the extension at
// deploy/startup time into the same layout.
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");

const fixture = resolve(pkgRoot, "fixtures/galaxy-workflows.vsix");
const extDir = resolve(pkgRoot, "public/ext/galaxy-workflows");

function cleanExtDir() {
  if (existsSync(extDir)) rmSync(extDir, { recursive: true, force: true });
}

if (!existsSync(fixture)) {
  // Clean up a stale staged copy so builds don't silently ship yesterday's
  // fixture after the contributor removed it.
  if (existsSync(extDir)) {
    cleanExtDir();
    console.log(`[stage-extension] removed stale ${extDir} (fixture absent)`);
  } else {
    console.log(`[stage-extension] no fixture at ${fixture}; skipping`);
  }
  process.exit(0);
}

// Always clear the target dir before re-staging so removed files don't linger.
cleanExtDir();
mkdirSync(extDir, { recursive: true });

const zipBytes = readFileSync(fixture);
const files = unzipSync(new Uint8Array(zipBytes));

let count = 0;
for (const [name, bytes] of Object.entries(files)) {
  // VS Code .vsix archives prefix every content file with `extension/`.
  if (!name.startsWith("extension/")) continue;
  const rel = name.slice("extension/".length);
  if (rel.length === 0 || rel.endsWith("/")) continue;
  const dest = resolve(extDir, rel);
  // Guard: defence against a malicious archive entry escaping extDir.
  if (dest !== extDir && !dest.startsWith(extDir + "/")) {
    throw new Error(`[stage-extension] refusing to write outside extDir: ${name}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  count += 1;
}

// Record the manifest name/version for easy inspection.
const manifestPath = resolve(extDir, "package.json");
let label = "";
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(strFromU8(files["extension/package.json"]));
    label = ` (${manifest.publisher ?? "?"}/${manifest.name ?? "?"}@${manifest.version ?? "?"})`;
  } catch {
    // fine — just skip the label
  }
}
console.log(`[stage-extension] unpacked ${count} files${label} → ${extDir}`);
