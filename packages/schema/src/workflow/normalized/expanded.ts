/**
 * Expanded workflow models.
 *
 * Expansion resolves all external references (@import, URL, TRS) in step
 * run/subworkflow fields. For now, only inline subworkflows are handled
 * (no URL fetching). External references remain as-is until a resolver
 * is wired in.
 *
 * Port of gxformat2/normalized/_conversion.py expanded_format2/expanded_native.
 */

import type { NormalizedFormat2Workflow, NormalizedFormat2Step } from "./format2.js";
import { normalizedFormat2 } from "./format2.js";
import type { NormalizedNativeWorkflow, NormalizedNativeStep } from "./native.js";
import { normalizedNative } from "./native.js";

// Expanded types are structurally identical to normalized for now.
// When URL resolution is added, the step.run / step.subworkflow fields
// will be guaranteed to be inline workflow objects (never strings).
export type ExpandedFormat2Workflow = NormalizedFormat2Workflow;
export type ExpandedFormat2Step = NormalizedFormat2Step;
export type ExpandedNativeWorkflow = NormalizedNativeWorkflow;
export type ExpandedNativeStep = NormalizedNativeStep;

/**
 * Normalize and expand a Format2 workflow.
 *
 * Resolves inline subworkflows recursively. External URL/import
 * references are not yet resolved (would need an async resolver).
 */
export function expandedFormat2(raw: unknown): ExpandedFormat2Workflow {
  const wf = normalizedFormat2(raw);
  return _expandFormat2(wf);
}

/**
 * Normalize and expand a native workflow.
 *
 * Resolves inline subworkflows recursively. External content_id URL
 * references are not yet resolved.
 */
export function expandedNative(raw: unknown): ExpandedNativeWorkflow {
  const wf = normalizedNative(raw);
  return _expandNative(wf);
}

function _expandFormat2(wf: NormalizedFormat2Workflow): ExpandedFormat2Workflow {
  const expandedSteps = wf.steps.map((step) => {
    if (step.run && typeof step.run === "object") {
      return { ...step, run: _expandFormat2(step.run as NormalizedFormat2Workflow) };
    }
    // Steps without run or with string run pass through
    return { ...step, run: step.run ?? null };
  });
  return { ...wf, steps: expandedSteps };
}

function _expandNative(wf: NormalizedNativeWorkflow): ExpandedNativeWorkflow {
  const expandedSteps: Record<string, NormalizedNativeStep> = {};
  for (const [key, step] of Object.entries(wf.steps)) {
    if (step.subworkflow != null) {
      expandedSteps[key] = { ...step, subworkflow: _expandNative(step.subworkflow) };
    } else {
      expandedSteps[key] = step;
    }
  }
  return { ...wf, steps: expandedSteps };
}
