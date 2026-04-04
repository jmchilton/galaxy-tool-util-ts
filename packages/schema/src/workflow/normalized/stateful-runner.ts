/**
 * Shared per-step runner for stateful conversions.
 *
 * Both `toFormat2Stateful` and `toNativeStateful` need the same boilerplate:
 * eligibility gate → id resolution → tool-cache lookup → try/catch →
 * per-step status tracking. This module factors that out so each wrapper
 * only supplies the config that differs (predicate, id extractor, convert).
 */

import type { ToolParameterModel } from "../../schema/bundle-types.js";

export interface StepConversionStatus {
  stepId: string;
  toolId?: string;
  converted: boolean;
  error?: string;
}

export interface StepRunnerConfig<Args, Result> {
  /** Map keyed by tool_id — pre-resolved by the CLI/caller layer. */
  toolInputs: Map<string, ToolParameterModel[]>;
  /** Per-step status entries are pushed into this array. */
  status: StepConversionStatus[];
  /** Return true if the step should participate in stateful conversion. */
  isEligible: (args: Args) => boolean;
  /** Extract identifiers for status reporting. */
  resolveIds: (args: Args) => { stepId: string; toolId?: string };
  /** Perform the conversion. Thrown errors are caught and reported. */
  convert: (args: Args, inputs: ToolParameterModel[]) => Result;
}

/**
 * Build a per-step callback with status tracking and graceful fallback.
 *
 * Return semantics:
 * - ineligible step → `null`, no status entry
 * - missing tool in cache → `null`, error status pushed
 * - convert threw → `null`, error status pushed
 * - convert returned → value passed through, converted status pushed
 */
export function makeStepConversionRunner<Args, Result>(
  config: StepRunnerConfig<Args, Result>,
): (args: Args) => Result | null {
  const { toolInputs, status, isEligible, resolveIds, convert } = config;
  return (args) => {
    if (!isEligible(args)) return null;
    const { stepId, toolId } = resolveIds(args);
    const inputs = toolId != null ? toolInputs.get(toolId) : undefined;

    if (inputs == null) {
      status.push({
        stepId,
        toolId,
        converted: false,
        error: toolId == null ? "step has no tool_id" : `tool not in cache: ${toolId}`,
      });
      return null;
    }

    try {
      const result = convert(args, inputs);
      status.push({ stepId, toolId, converted: true });
      return result;
    } catch (err) {
      status.push({
        stepId,
        toolId,
        converted: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };
}
