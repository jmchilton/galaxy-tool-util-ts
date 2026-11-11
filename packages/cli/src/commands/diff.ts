/**
 * `gxwf diff` — structural diff of two Format2 workflows (either may be a
 * draft). Wraps `diffWorkflows` from @galaxy-tool-util/schema; port of
 * gxformat2's `gxwf-diff`.
 *
 * Exit codes:
 *   0 — diff ran (any result, unless --exit-code)
 *   1 — --exit-code and the workflows differ
 *   2 — parse/read failure or unsupported input (native, $graph)
 */
import { diffWorkflows, renderWorkflowDiff, resolveFormat } from "@galaxy-tool-util/schema";
import { readWorkflowFile } from "./workflow-io.js";

export interface DiffOptions {
  json?: boolean;
  exitCode?: boolean;
}

export async function runDiff(before: string, after: string, opts: DiffOptions): Promise<void> {
  const workflows: Record<string, unknown>[] = [];
  for (const filePath of [before, after]) {
    const data = await readWorkflowFile(filePath);
    if (!data) {
      process.exitCode = 2;
      return;
    }
    if (resolveFormat(data) === "native") {
      console.error(`diff requires format2 — ${filePath} is a native workflow`);
      process.exitCode = 2;
      return;
    }
    workflows.push(data);
  }

  let diff;
  try {
    diff = diffWorkflows(workflows[0], workflows[1]);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
    return;
  }

  console.log(opts.json ? JSON.stringify(diff, null, 2) : renderWorkflowDiff(diff));
  process.exitCode = opts.exitCode && diff.has_changes ? 1 : 0;
}
