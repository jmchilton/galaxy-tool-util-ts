import { resolveFormat } from "../../workflow/serialize.js";
import type { WorkflowFormat } from "../../workflow/detect-format.js";
import { extractFormat2Inputs, extractFormat2Outputs } from "./extract-format2.js";
import { extractNativeInputs, extractNativeOutputs } from "./extract-native.js";
import type { WorkflowInput, WorkflowOutput } from "./types.js";

/**
 * Format-aware extractor. Uses the schema package's `resolveFormat` so
 * callers don't have to sniff native vs format2 themselves.
 */
export function extractWorkflowInputs(
  parsed: Record<string, unknown>,
  format?: WorkflowFormat,
): WorkflowInput[] {
  const f = format ?? resolveFormat(parsed);
  return f === "format2" ? extractFormat2Inputs(parsed) : extractNativeInputs(parsed);
}

export function extractWorkflowOutputs(
  parsed: Record<string, unknown>,
  format?: WorkflowFormat,
): WorkflowOutput[] {
  const f = format ?? resolveFormat(parsed);
  return f === "format2" ? extractFormat2Outputs(parsed) : extractNativeOutputs(parsed);
}
