/**
 * Shared rendering for StepValidationResult arrays.
 */
import type { StepValidationResult } from "./validate-workflow.js";

export interface RenderSummary {
  validated: number;
  skipped: number;
}

/** Render step validation results to console, returning counts. */
export function renderStepResults(results: StepValidationResult[]): RenderSummary {
  let validated = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.status === "skip") {
      skipped++;
      console.warn(`  [${r.stepLabel}] skipped — ${r.errors[0] ?? "unknown"}`);
    } else if (r.status === "fail") {
      validated++;
      console.error(`  [${r.stepLabel}] tool_state errors (${r.toolId}):`);
      for (const line of r.errors) console.error(`    ${line}`);
    } else {
      validated++;
      console.log(`  [${r.stepLabel}] tool_state: OK`);
    }
  }
  return { validated, skipped };
}
