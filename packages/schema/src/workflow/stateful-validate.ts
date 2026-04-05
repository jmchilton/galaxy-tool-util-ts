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

  const decode = S.decodeUnknownEither(model as S.Schema<unknown>, { onExcessProperty: "ignore" });
  const result = decode(state);
  if (result._tag === "Left") {
    throw new ConversionValidationFailure("pre", formatIssues(result.left));
  }
}

/**
 * Validate format2 tool_state against `workflow_step`. Any stray
 * `ConnectedValue` markers left over from normalization are stripped
 * before validation (they belong in the `in` block, not the state).
 *
 * Returns silently on success or if the schema cannot be built. Throws
 * `ConversionValidationFailure` with phase="post" on validation failure.
 */
export function validateFormat2StepState(
  inputs: ToolParameterModel[],
  format2State: Record<string, unknown>,
): void {
  const bundle = buildBundle(inputs);
  const model = createFieldModel(bundle, "workflow_step");
  if (!model) return;

  const state = deepClone(format2State);
  stripConnectedValues(inputs, state);

  const decode = S.decodeUnknownEither(model as S.Schema<unknown>, { onExcessProperty: "ignore" });
  const result = decode(state);
  if (result._tag === "Left") {
    throw new ConversionValidationFailure("post", formatIssues(result.left));
  }
}
