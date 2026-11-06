import type { ValidationStepResult } from "@galaxy-tool-util/schema";

/**
 * Report label for a step: slash-joined from the outermost workflow. `parent` is
 * undefined at the top level and null under an unlabelled step, whose children get
 * no label either, since `inner` alone could be mistaken for a top-level step.
 */
export function stepLabelPath(
  parent: string | null | undefined,
  label: string | null | undefined,
): string | null {
  if (parent === null || !label) return null;
  return parent === undefined ? label : `${parent}/${label}`;
}

export function withStepLabel(
  result: ValidationStepResult,
  label: string | null,
): ValidationStepResult {
  return label === null ? result : { ...result, label };
}
