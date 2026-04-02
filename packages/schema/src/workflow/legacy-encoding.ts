/**
 * Classified detection of legacy parameter encoding in native workflow tool state.
 *
 * Port of Galaxy's `galaxy.tool_util.workflow_state.legacy_encoding`.
 *
 * Galaxy has two native tool_state serialization formats:
 *
 * - **Modern encoding** (nested=True): used in .ga files / IWC.
 *   After json.loads, all values at all depths are already correct types.
 *
 * - **Legacy parameter encoding** (nested=False): used in the workflow
 *   editor API and some old framework test workflows.  Root values are
 *   individually JSON-stringified, so containers are still JSON strings
 *   and typed scalars are stringified (int 2 → "2").
 *
 * Detection signals:
 *   1. Container params (conditional, section, repeat): a string value
 *      is definitive legacy encoding; a dict/list is definitive modern.
 *   2. Select params with static options: a quoted value that doesn't
 *      match any option but unquoted does → definitive legacy encoding.
 */

import type { ToolParameterModel, SelectParameterModel } from "../schema/bundle-types.js";

export type LegacyEncodingClassification = "yes" | "maybe_assumed_no" | "no";

export interface LegacyEncodingHit {
  parameterName: string;
  parameterType: string;
  detail: string;
}

export interface LegacyEncodingScanResult {
  classification: LegacyEncodingClassification;
  hits: LegacyEncodingHit[];
  signalsChecked: number;
}

const CONTAINER_TYPES = new Set(["gx_conditional", "gx_section", "gx_repeat"]);

function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Scan decoded native tool_state for legacy parameter encoding.
 *
 * Checks root-level container params and select params with static options.
 */
export function scanToolState(
  toolInputs: ToolParameterModel[],
  toolState: Record<string, unknown>,
): LegacyEncodingScanResult {
  const hits: LegacyEncodingHit[] = [];
  let signalsChecked = 0;

  for (const toolInput of toolInputs) {
    const parameterType = toolInput.parameter_type;
    const name = toolInput.name;
    const value = toolState[name];
    if (value === undefined || value === null) {
      continue;
    }

    if (CONTAINER_TYPES.has(parameterType)) {
      signalsChecked++;
      if (typeof value === "string") {
        hits.push({
          parameterName: name,
          parameterType,
          detail: "container value is a string",
        });
      }
    } else if (parameterType === "gx_select" && typeof value === "string") {
      const select = toolInput as SelectParameterModel;
      if (select.options) {
        const optionValues = new Set(select.options.map((o) => o.value));
        signalsChecked++;
        if (!optionValues.has(value) && optionValues.has(stripQuotes(value))) {
          hits.push({
            parameterName: name,
            parameterType,
            detail: `quoted value ${JSON.stringify(value)} doesn't match options, unquoted does`,
          });
        }
      }
    }
  }

  let classification: LegacyEncodingClassification;
  if (hits.length > 0) {
    classification = "yes";
  } else if (signalsChecked === 0) {
    classification = "maybe_assumed_no";
  } else {
    classification = "no";
  }

  return { classification, hits, signalsChecked };
}
