#!/usr/bin/env node
/**
 * Inject stale keys into a .ga workflow to produce fixtures/workspace-seed/iwc/stale-keys.ga.
 *
 * Usage:
 *   node scripts/mutate-dirty.mjs <source.ga> <dest.ga>
 *
 * The destination file is overwritten. Idempotent — re-running produces the
 * same output given the same source.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const [, , srcArg, dstArg] = process.argv;
if (!srcArg || !dstArg) {
  console.error("Usage: mutate-dirty.mjs <source.ga> <dest.ga>");
  process.exit(1);
}

const src = path.resolve(srcArg);
const dst = path.resolve(dstArg);

const wf = JSON.parse(fs.readFileSync(src, "utf8"));
const toolStepKey = Object.keys(wf.steps)
  .sort()
  .find((k) => wf.steps[k].type === "tool" && typeof wf.steps[k].tool_state === "string");
if (!toolStepKey) {
  throw new Error("no tool step with string tool_state found to mutate");
}
const step = wf.steps[toolStepKey];
const ts = JSON.parse(step.tool_state);
ts.__page__ = null;
ts.__rerun_remap_job_id__ = null;
ts.chromInfo = "?";
step.tool_state = JSON.stringify(ts);
step.errors = null;
step.uuid = "11111111-1111-1111-1111-111111111111";

fs.writeFileSync(dst, JSON.stringify(wf, null, 4) + "\n");
console.log(`wrote ${dst} (injected stale keys into step ${toolStepKey})`);
