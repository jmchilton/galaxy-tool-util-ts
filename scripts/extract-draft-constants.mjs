#!/usr/bin/env node
// Extract draft-workflow sentinel constants from gxformat2/draft.py and write
// them as JSON so check-sync-draft-sentinel can compare against the TS
// source-of-truth in packages/schema/src/workflow/draft-checks.ts.
//
// Usage:
//   node scripts/extract-draft-constants.mjs <draft.py path> <out json path>

import fs from "node:fs";
import path from "node:path";

const [, , srcPath, outPath] = process.argv;
if (!srcPath || !outPath) {
  console.error("Usage: extract-draft-constants.mjs <draft.py> <out.json>");
  process.exit(2);
}

const src = fs.readFileSync(srcPath, "utf-8");

const patternMatch = src.match(/TODO_SENTINEL_PATTERN\s*:[^=]*=\s*r?"([^"]+)"/);
if (!patternMatch) {
  console.error(`FAIL: could not find TODO_SENTINEL_PATTERN in ${srcPath}`);
  process.exit(1);
}

const planFieldsMatch = src.match(/PLAN_FIELDS\s*:[^=]*=\s*\(([^)]+)\)/);
if (!planFieldsMatch) {
  console.error(`FAIL: could not find PLAN_FIELDS in ${srcPath}`);
  process.exit(1);
}
const planFields = [...planFieldsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const out = {
  source: path.basename(srcPath),
  todo_sentinel_pattern: patternMatch[1],
  plan_fields: planFields,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
