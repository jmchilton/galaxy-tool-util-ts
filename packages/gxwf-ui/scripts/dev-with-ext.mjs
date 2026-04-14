#!/usr/bin/env node
// `pnpm dev:with-ext` driver. Spawns the galaxy-workflows-vscode build:watch
// in parallel with `vite dev` pointed at that folder via
// VITE_GXWF_EXT_SOURCE=folder:$GXWF_EXT_PATH. Fails loudly if GXWF_EXT_PATH
// is unset or doesn't look like a galaxy-workflows-vscode checkout.
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

const extPath = process.env.GXWF_EXT_PATH;
if (!extPath) {
  console.error(
    "[dev-with-ext] GXWF_EXT_PATH is not set. Point it at a galaxy-workflows-vscode checkout\n" +
      "                at the pinned commit (see packages/gxwf-ui/EXT_COMMIT.md), e.g.\n" +
      "                  GXWF_EXT_PATH=~/projects/repositories/galaxy-workflows-vscode pnpm dev:with-ext",
  );
  process.exit(1);
}

const abs = resolve(extPath.replace(/^~/, process.env.HOME ?? "~"));
const manifestPath = join(abs, "package.json");
if (!existsSync(manifestPath)) {
  console.error(`[dev-with-ext] GXWF_EXT_PATH does not contain package.json: ${abs}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
if (manifest.name !== "galaxy-workflows") {
  console.error(
    `[dev-with-ext] Expected galaxy-workflows manifest at ${abs}, found "${manifest.name}".`,
  );
  process.exit(1);
}
if (!manifest.scripts?.["build:watch"]) {
  console.error(
    `[dev-with-ext] ${abs}/package.json has no build:watch script. Check EXT_COMMIT.md pin.`,
  );
  process.exit(1);
}

const args = [
  "concurrently",
  "-n",
  "ext,ui",
  "-c",
  "blue,green",
  `pnpm -C "${abs}" run build:watch`,
  `VITE_GXWF_EXT_SOURCE=folder:${abs} pnpm dev`,
];
const child = spawn("pnpm", ["exec", ...args], {
  stdio: "inherit",
  env: process.env,
  shell: false,
});
child.on("exit", (code) => process.exit(code ?? 0));
