/**
 * Polymorphic entry points: accept any workflow representation,
 * return the desired typed model.
 *
 * Port of gxformat2/normalized/_conversion.py ensure_format2/ensure_native.
 */

import type { NormalizedFormat2Workflow } from "./format2.js";
import { normalizedFormat2 } from "./format2.js";
import type { NormalizedNativeWorkflow } from "./native.js";
import { normalizedNative } from "./native.js";
import { toFormat2 } from "./toFormat2.js";
import { toNative } from "./toNative.js";

/**
 * Ensure a workflow is returned as normalized Format2.
 *
 * Accepts native or Format2 inputs (raw dict), normalizing/converting as needed.
 */
export function ensureFormat2(raw: unknown): NormalizedFormat2Workflow {
  const obj = raw as Record<string, unknown>;

  // Native workflow → convert
  if (obj.a_galaxy_workflow === "true") {
    return toFormat2(raw);
  }

  // Format2 workflow → normalize
  return normalizedFormat2(raw);
}

/**
 * Ensure a workflow is returned as normalized native.
 *
 * Accepts native or Format2 inputs (raw dict), normalizing/converting as needed.
 */
export function ensureNative(raw: unknown): NormalizedNativeWorkflow {
  const obj = raw as Record<string, unknown>;

  // Native workflow → normalize directly
  if (obj.a_galaxy_workflow === "true") {
    return normalizedNative(raw);
  }

  // Format2 workflow → convert
  if (obj.class === "GalaxyWorkflow") {
    return toNative(raw);
  }

  // Fallback: assume native
  return normalizedNative(raw);
}
