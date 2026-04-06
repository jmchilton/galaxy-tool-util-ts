/**
 * Shared rendering for ValidationStepResult arrays.
 */
import { SKIP_STATUSES, type ValidationStepResult } from "@galaxy-tool-util/schema";

export interface RenderSummary {
  validated: number;
  skipped: number;
}

/** Render step validation results to console, returning counts. */
export function renderStepResults(results: ValidationStepResult[]): RenderSummary {
  let validated = 0;
  let skipped = 0;
  for (const r of results) {
    if (SKIP_STATUSES.has(r.status)) {
      skipped++;
      console.warn(`  [${r.step}] skipped — ${r.errors[0] ?? "unknown"}`);
    } else if (r.status === "fail") {
      validated++;
      console.error(`  [${r.step}] tool_state errors (${r.tool_id}):`);
      for (const line of r.errors) console.error(`    ${line}`);
    } else {
      validated++;
      console.log(`  [${r.step}] tool_state: OK`);
    }
  }
  return { validated, skipped };
}
