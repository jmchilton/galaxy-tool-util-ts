/**
 * Schema validation wrappers for stateful conversion.
 *
 * Runs the generated Effect Schema (`createFieldModel`) against native
 * tool_state (pre-conversion) and format2 state (post-conversion), throwing
 * a tagged `ConversionValidationFailure` on mismatch. The stateful wrappers
 * catch this and push a structured fallback entry so callers can
 * distinguish validation failures from walker errors.
 *
 * Deferred from Step 2 of TS_STATEFUL_CONVERSION_PLAN — integration point
 * is the stateful runner, which calls these pre/post `convert`.
 */

import * as S from "effect/Schema";
import * as ParseResult from "effect/ParseResult";
// Side-effect import: registers all parameter generators so createFieldModel
// can look them up. Without this, a direct import of model-factory returns
// undefined for every call (the parameters/index.js side-effects never run).
import "../schema/parameters/index.js";
import { createFieldModel } from "../schema/model-factory.js";
import type { ToolParameterBundleModel, ToolParameterModel } from "../schema/bundle-types.js";
import { injectConnectionsIntoState, stripConnectedValues } from "./state-merge.js";
import { StringContainerError } from "./walker.js";

export type ValidationPhase = "pre" | "post";

/**
 * Thrown when tool_state fails Effect Schema validation before or after
 * stateful conversion. Carries the phase and formatted issue list so the
 * runner can emit a structured fallback status.
 */
export class ConversionValidationFailure extends Error {
  readonly _tag = "ConversionValidationFailure" as const;
  constructor(
    public readonly phase: ValidationPhase,
    public readonly issues: string[],
  ) {
    super(`state failed ${phase}-conversion validation: ${issues.join("; ")}`);
    this.name = "ConversionValidationFailure";
  }
}

function formatIssues(error: ParseResult.ParseError): string[] {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error);
  return issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}

/** Decode `state` against `model`, throwing a phase-tagged failure on mismatch. */
function decodeOrThrow(
  model: S.Schema<unknown>,
  state: Record<string, unknown>,
  phase: ValidationPhase,
): void {
  const result = S.decodeUnknownEither(model, { onExcessProperty: "ignore" })(state);
  if (result._tag === "Left") {
    throw new ConversionValidationFailure(phase, formatIssues(result.left));
  }
}

function buildBundle(inputs: ToolParameterModel[]): ToolParameterBundleModel {
  return { parameters: inputs };
}

/** JSON-safe deep clone — tool_state is plain data. Avoids `structuredClone`
 * which isn't in the schema package's TS lib (no `@types/node`). */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Validate native tool_state against `workflow_step_native`. Connection
 * paths are merged as `ConnectedValue` markers before validation so linked
 * fields don't trip the schema.
 *
 * Returns silently if the schema cannot be built (unsupported parameter
 * types) or if validation passes. Throws `ConversionValidationFailure`
 * with phase="pre" on validation failure.
 */
export function validateNativeStepState(
  inputs: ToolParameterModel[],
  toolState: Record<string, unknown>,
  inputConnections: Record<string, unknown> = {},
): void {
  const bundle = buildBundle(inputs);
  const model = createFieldModel(bundle, "workflow_step_native");
  if (!model) return; // unsupported parameter types — skip validation, conversion may still work

  // Deep copy + inject connections so ConnectedValue markers appear where the
  // schema expects them (matches validate-workflow's native path).
  const state = deepClone(toolState);
  if (Object.keys(inputConnections).length > 0) {
    injectConnectionsIntoState(inputs, state, inputConnections);
  }

  decodeOrThrow(model as S.Schema<unknown>, state, "pre");
}

/**
 * Validate format2 tool_state after stateful conversion.
 *
 * Validation follows the upstream Python two-model pipeline:
 *
 * 1. Strip any serialized ConnectedValue markers and validate the stored state
 *    against `workflow_step`. Every field is optional in this unlinked editor
 *    representation, but values that are present must still have the right type.
 * 2. Inject the step's actual `in` connections and validate the effective state
 *    against `workflow_step_linked`. This restores requiredness while allowing a
 *    connection marker to satisfy a required leaf.
 *
 * Returns silently on success or if the schema cannot be built. Throws
 * `ConversionValidationFailure` with phase="post" on validation failure.
 */
export function validateFormat2StepState(
  inputs: ToolParameterModel[],
  format2State: Record<string, unknown>,
  inputConnections: Record<string, unknown> = {},
): void {
  const bundle = buildBundle(inputs);
  const unlinkedModel = createFieldModel(bundle, "workflow_step");
  const linkedModel = createFieldModel(bundle, "workflow_step_linked");
  if (!unlinkedModel || !linkedModel) return;

  const state = deepClone(format2State);
  stripConnectedValues(inputs, state);
  decodeOrThrow(unlinkedModel as S.Schema<unknown>, state, "post");

  const linkedState = deepClone(state);
  const remaining = injectConnectionsIntoState(inputs, linkedState, inputConnections, {
    linked: true,
  });
  const unmatched = Object.keys(remaining);
  if (unmatched.length > 0) {
    throw new ConversionValidationFailure(
      "post",
      unmatched.map((path) => `${path}: input connection does not match a tool parameter`),
    );
  }
  decodeOrThrow(linkedModel as S.Schema<unknown>, linkedState, "post");
}

/**
 * A single diagnostic produced by tool-state validation.
 *
 * Defined here (lower-level module) so both {@link validateFormat2StepStateStrict}
 * and the higher-level {@link ToolStateValidator} share one canonical type.
 */
export interface ToolStateDiagnostic {
  /** Dot-separated parameter path, or "" for top-level / unlocated issues. */
  path: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Map a {@link StringContainerError} thrown by the walker into a located
 * diagnostic. The walker joins nested paths with `|`; diagnostics use `.` to
 * match the Effect Schema issue paths, so normalize the separator here.
 */
export function stringContainerDiagnostic(error: StringContainerError): ToolStateDiagnostic {
  const path = error.path.split("|").join(".");
  return {
    path,
    message: `Invalid value for "${path}": expected a nested object or list, not a plain value.`,
    severity: "error",
  };
}

/**
 * Strict variant of {@link validateFormat2StepState}: reports unknown keys as
 * diagnostics rather than silently ignoring them.
 *
 * Uses `onExcessProperty: "error"` so Effect Schema flags any key that has no
 * corresponding parameter definition. Returns an empty array if the schema
 * cannot be built or validation passes.
 */
export function validateFormat2StepStateStrict(
  inputs: ToolParameterModel[],
  format2State: Record<string, unknown>,
  inputConnections: Record<string, unknown> = {},
): ToolStateDiagnostic[] {
  const bundle = buildBundle(inputs);
  const unlinkedModel = createFieldModel(bundle, "workflow_step");
  const linkedModel = createFieldModel(bundle, "workflow_step_linked");
  if (!unlinkedModel || !linkedModel) return [];

  const state = deepClone(format2State);
  // The walker rejects a scalar where a container is expected by throwing; the
  // strict validator's contract is to *return* diagnostics, so map it instead
  // of letting it crash the whole validation pass.
  try {
    stripConnectedValues(inputs, state);
  } catch (error) {
    if (error instanceof StringContainerError) {
      return [stringContainerDiagnostic(error)];
    }
    throw error;
  }

  const decodeStrict = (model: S.Schema<unknown>, value: Record<string, unknown>) => {
    const result = S.decodeUnknownEither(model, { onExcessProperty: "error" })(value);
    if (result._tag === "Right") return [];
    return ParseResult.ArrayFormatter.formatErrorSync(result.left).map(
      (i): ToolStateDiagnostic => ({
        path: i.path.map(String).join("."),
        message: i.message,
        severity: "error",
      }),
    );
  };

  const unlinkedDiagnostics = decodeStrict(unlinkedModel as S.Schema<unknown>, state);
  if (unlinkedDiagnostics.length > 0) return unlinkedDiagnostics;

  const linkedState = deepClone(state);
  let remaining: Record<string, unknown>;
  try {
    remaining = injectConnectionsIntoState(inputs, linkedState, inputConnections, { linked: true });
  } catch (error) {
    if (error instanceof StringContainerError) {
      return [stringContainerDiagnostic(error)];
    }
    throw error;
  }
  const unmatchedDiagnostics = Object.keys(remaining).map(
    (path): ToolStateDiagnostic => ({
      path: path.split("|").join("."),
      message: "Input connection does not match a tool parameter.",
      severity: "error",
    }),
  );
  if (unmatchedDiagnostics.length > 0) return unmatchedDiagnostics;

  return decodeStrict(linkedModel as S.Schema<unknown>, linkedState);
}
