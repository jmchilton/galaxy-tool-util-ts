#!/usr/bin/env node
/**
 * Copy non-TS assets (YAML catalogs) into packages/schema/dist so they ship
 * with the published package and are resolvable relative to compiled JS.
 *
 * tsc only emits .js/.d.ts/.map; YAML files need a separate copy step.
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "packages", "schema");

const ASSETS = [
  ["src/workflow/schema_rules.yml", "dist/workflow/schema_rules.yml"],
  ["src/workflow/lint_profiles.yml", "dist/workflow/lint_profiles.yml"],
];

for (const [src, dst] of ASSETS) {
  const srcPath = resolve(PKG_ROOT, src);
  const dstPath = resolve(PKG_ROOT, dst);
  mkdirSync(dirname(dstPath), { recursive: true });
  copyFileSync(srcPath, dstPath);
  console.log(`copied ${src} → ${dst}`);
}
