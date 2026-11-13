import { UNLABELED_STEP_PREFIX, type ValidationStepResult } from "@galaxy-tool-util/schema";

/**
 * What a step goes by in report labels: its label or, inside a subworkflow, the
 * key `in:` references use, which survives draft extraction where `step` doesn't.
 * A top-level step has no fallback, so a label path always starts from a real name.
 */
export function stepName(
  label: string | null | undefined,
  key: string,
  prefix: string,
): string | null {
  if (label) return label;
  return prefix ? key.replace(UNLABELED_STEP_PREFIX, "") : null;
}

export function withStepLabel(
  result: ValidationStepResult,
  label: string | null | undefined,
): ValidationStepResult {
  return label ? { ...result, label } : result;
}

/**
 * Qualify a subworkflow step's results as `outer/inner`. Under a nameless step
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
