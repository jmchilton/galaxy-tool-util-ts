#!/usr/bin/env node
// Fail if the TS draft sentinel constants drift from the upstream gxformat2
// snapshot. Compares packages/schema/src/workflow/draft-checks.ts against
// schema-sources/v19_09/draft_constants.json (written by sync-schema-sources).
//
// Usage: node scripts/check-draft-sentinel.mjs

import fs from "node:fs";

const SNAPSHOT = "schema-sources/v19_09/draft_constants.json";
const TS_SOURCE = "packages/schema/src/workflow/draft-checks.ts";

if (!fs.existsSync(SNAPSHOT)) {
  console.log(
    `SKIP draft-sentinel drift check: ${SNAPSHOT} not present. ` +
      `Run \`make sync-schema-sources\` with GXFORMAT2_ROOT pointed at a draft-aware checkout to enable.`,
  );
  process.exit(0);
}

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf-8"));
const tsSrc = fs.readFileSync(TS_SOURCE, "utf-8");

const patternMatch = tsSrc.match(/TODO_SENTINEL_PATTERN\s*=\s*\/([^/]+)\//);
if (!patternMatch) {
  console.error(`FAIL: could not extract TODO_SENTINEL_PATTERN from ${TS_SOURCE}`);
  process.exit(1);
}
const planFieldsMatch = tsSrc.match(/PLAN_FIELDS\s*=\s*\[([^\]]+)\]/);
if (!planFieldsMatch) {
  console.error(`FAIL: could not extract PLAN_FIELDS from ${TS_SOURCE}`);
  process.exit(1);
}
const planFields = [...planFieldsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

let ok = true;
if (patternMatch[1] !== snapshot.todo_sentinel_pattern) {
  console.error(
    `FAIL TODO_SENTINEL_PATTERN drift:\n` +
      `  upstream (gxformat2/draft.py): ${snapshot.todo_sentinel_pattern}\n` +
      `  TS (${TS_SOURCE}):            ${patternMatch[1]}`,
  );
  ok = false;
}
if (JSON.stringify(planFields) !== JSON.stringify(snapshot.plan_fields)) {
  console.error(
    `FAIL PLAN_FIELDS drift:\n` +
      `  upstream: ${JSON.stringify(snapshot.plan_fields)}\n` +
      `  TS:       ${JSON.stringify(planFields)}`,
  );
  ok = false;
}
if (!ok) {
  console.error(
    `\nUpdate ${TS_SOURCE} to match the upstream contract, or re-sync ` +
      `via \`make sync-schema-sources\` if upstream has changed intentionally.`,
  );
  process.exit(1);
}
console.log("draft-sentinel: TS constants match upstream snapshot.");
