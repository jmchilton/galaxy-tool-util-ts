/**
 * Shared per-step runner for stateful conversions.
 *
 * Both `toFormat2Stateful` and `toNativeStateful` need the same boilerplate:
 * eligibility gate → id resolution → tool-inputs lookup → try/catch →
 * per-step status tracking. This module factors that out so each wrapper
 * only supplies the config that differs (predicate, id extractor, convert).
 *
 * Tool lookup is callback-shaped (matching gxformat2's
 * `ConversionOptions.state_encode_to_*` design) — callers pass a resolver
 * `(toolId, toolVersion) => ToolParameterModel[] | undefined` and own the
 * caching / loading strategy. Version disambiguation is the caller's
 * responsibility, not the runner's.
 */

import type { ToolParameterModel } from "../../schema/bundle-types.js";

export type ToolInputsResolver = (
  toolId: string,
  toolVersion: string | null,
) => ToolParameterModel[] | undefined;

export interface StepConversionStatus {
  stepId: string;
  toolId?: string;
  toolVersion?: string | null;
  converted: boolean;
  error?: string;
}

export interface StepRunnerConfig<Args, Result> {
  /** Resolve parameter inputs for a given tool_id/tool_version pair. */
  toolInputsResolver: ToolInputsResolver;
  /** Per-step status entries are pushed into this array. */
  status: StepConversionStatus[];
  /** Return true if the step should participate in stateful conversion. */
  isEligible: (args: Args) => boolean;
  /** Extract identifiers for status reporting and lookup. */
  resolveIds: (args: Args) => {
    stepId: string;
    toolId?: string;
    toolVersion?: string | null;
  };
  /** Perform the conversion. Thrown errors are caught and reported. */
  convert: (args: Args, inputs: ToolParameterModel[]) => Result;
}

/**
 * Build a per-step callback with status tracking and graceful fallback.
 *
 * Return semantics:
 * - ineligible step → `null`, no status entry
 * - resolver returned undefined → `null`, error status pushed
 * - convert threw → `null`, error status pushed
 * - convert returned → value passed through, converted status pushed
 */
export function makeStepConversionRunner<Args, Result>(
  config: StepRunnerConfig<Args, Result>,
): (args: Args) => Result | null {
  const { toolInputsResolver, status, isEligible, resolveIds, convert } = config;
  return (args) => {
    if (!isEligible(args)) return null;
    const { stepId, toolId, toolVersion = null } = resolveIds(args);
    const inputs = toolId != null ? toolInputsResolver(toolId, toolVersion) : undefined;

    if (inputs == null) {
      status.push({
        stepId,
        toolId,
        toolVersion,
        converted: false,
        error:
          toolId == null
            ? "step has no tool_id"
            : `tool not resolved: ${toolId}${toolVersion ? `@${toolVersion}` : ""}`,
      });
      return null;
    }

    try {
      const result = convert(args, inputs);
      status.push({ stepId, toolId, toolVersion, converted: true });
      return result;
    } catch (err) {
      status.push({
        stepId,
        toolId,
        toolVersion,
        converted: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };
}
