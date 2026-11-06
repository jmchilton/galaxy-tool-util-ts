import type { ValidationStepResult } from "@galaxy-tool-util/schema";

export function withStepLabel(
  result: ValidationStepResult,
  label: string | null | undefined,
): ValidationStepResult {
  return label ? { ...result, label } : result;
}

/**
 * Qualify a subworkflow step's results as `outer/inner`. Under an unlabelled step
 * they lose their label instead, since `inner` alone could be mistaken for a
 * top-level step.
 */
export function withParentLabel(
  results: ValidationStepResult[],
  parent: string | null | undefined,
): ValidationStepResult[] {
  return results.map(({ label, ...result }) =>
    parent && label ? { ...result, label: `${parent}/${label}` } : result,
  );
}
