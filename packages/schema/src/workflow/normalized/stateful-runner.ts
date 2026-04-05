/**
 * Shared per-step runner for stateful conversions.
 *
 * Both `toFormat2Stateful` and `toNativeStateful` need the same boilerplate:
 * eligibility gate → id resolution → tool-inputs lookup → optional precheck
 * → optional pre-conversion validation → convert → optional post-conversion
 * validation → per-step status tracking. This module factors that out so
 * each wrapper only supplies the config that differs (predicate, id
 * extractor, convert, optional hooks).
 *
 * Tool lookup is callback-shaped (matching gxformat2's
 * `ConversionOptions.state_encode_to_*` design) — callers pass a resolver
 * `(toolId, toolVersion) => ToolParameterModel[] | undefined` and own the
 * caching / loading strategy. Version disambiguation is the caller's
 * responsibility, not the runner's.
 *
 * Failure classes allow callers to distinguish *why* a step fell back:
 *
 * - `unknown_tool`    — resolver returned undefined (not in cache, no tool_id)
 * - `precheck`        — legacy replacement params or legacy encoding detected
 * - `pre_validation`  — native state fails `workflow_step_native` schema
 * - `conversion`      — walker/convert threw (unknown param type, bad structure)
 * - `post_validation` — converted format2/native state fails schema
 */

import type { ToolParameterModel } from "../../schema/bundle-types.js";

export type ToolInputsResolver = (
  toolId: string,
  toolVersion: string | null,
) => ToolParameterModel[] | undefined;

export type StepConversionFailureClass =
  | "unknown_tool"
  | "precheck"
  | "pre_validation"
  | "conversion"
  | "post_validation";

export interface StepConversionStatus {
  stepId: string;
  toolId?: string;
  toolVersion?: string | null;
  converted: boolean;
  /** Present when converted=false. Distinguishes why the fallback happened. */
  failureClass?: StepConversionFailureClass;
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
  /**
   * Optional non-throwing precheck. Return an array of reasons (strings)
   * if the step should be skipped without attempting conversion; return
   * null/empty for "ok to proceed".
   */
  precheck?: (args: Args, inputs: ToolParameterModel[]) => string[] | null;
  /**
   * Optional pre-conversion validation. Throw to signal failure — the
   * runner will catch, classify as `pre_validation`, and fall back.
   */
  preValidate?: (args: Args, inputs: ToolParameterModel[]) => void;
  /** Perform the conversion. Thrown errors are classified as `conversion`. */
  convert: (args: Args, inputs: ToolParameterModel[]) => Result;
  /**
   * Optional post-conversion validation on the converted result. Throw to
   * signal failure — classified as `post_validation`, result discarded.
   */
  postValidate?: (result: Result, inputs: ToolParameterModel[]) => void;
}

/**
 * Build a per-step callback with status tracking and graceful fallback.
 *
 * Return semantics:
 * - ineligible step → `null`, no status entry
 * - resolver returned undefined → `null`, `unknown_tool` status
 * - precheck returned reasons → `null`, `precheck` status
 * - preValidate threw → `null`, `pre_validation` status
 * - convert threw → `null`, `conversion` status
 * - postValidate threw → `null`, `post_validation` status
 * - success → result, `converted: true` status
 */
export function makeStepConversionRunner<Args, Result>(
  config: StepRunnerConfig<Args, Result>,
): (args: Args) => Result | null {
  const {
    toolInputsResolver,
    status,
    isEligible,
    resolveIds,
    precheck,
    preValidate,
    convert,
    postValidate,
  } = config;

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
        failureClass: "unknown_tool",
        error:
          toolId == null
            ? "step has no tool_id"
            : `tool not resolved: ${toolId}${toolVersion ? `@${toolVersion}` : ""}`,
      });
      return null;
    }

    if (precheck) {
      const reasons = precheck(args, inputs);
      if (reasons && reasons.length > 0) {
        status.push({
          stepId,
          toolId,
          toolVersion,
          converted: false,
          failureClass: "precheck",
          error: reasons.join("; "),
        });
        return null;
      }
    }

    if (preValidate) {
      try {
        preValidate(args, inputs);
      } catch (err) {
        status.push({
          stepId,
          toolId,
          toolVersion,
          converted: false,
          failureClass: "pre_validation",
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    }

    let result: Result;
    try {
      result = convert(args, inputs);
    } catch (err) {
      status.push({
        stepId,
        toolId,
        toolVersion,
        converted: false,
        failureClass: "conversion",
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    if (postValidate) {
      try {
        postValidate(result, inputs);
      } catch (err) {
        status.push({
          stepId,
          toolId,
          toolVersion,
          converted: false,
          failureClass: "post_validation",
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    }

    status.push({ stepId, toolId, toolVersion, converted: true });
    return result;
  };
}
