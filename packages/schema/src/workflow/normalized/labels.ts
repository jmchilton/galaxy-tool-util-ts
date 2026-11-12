/**
 * Utilities for handling unlabelled objects when translating workflow formats.
 *
 * Port of gxformat2/_labels.py.
 */

import type { NormalizedFormat2Workflow } from "./format2.js";
import { RUNTIME_VALUE_SOURCE } from "../runtime-markers.js";

export const UNLABELED_INPUT_PREFIX = "_unlabeled_input_";
export const UNLABELED_STEP_PREFIX = "_unlabeled_step_";

/**
 * Node id for a native step: its label, else a synthetic unlabeled sentinel.
 *
 * Shared by native→Format2 conversion and layout position matching so the two
 * cannot drift.
 */
export function unlabeledNodeId(
  label: string | null | undefined,
  stepId: string | number,
  isInput: boolean,
): string {
  if (label != null) return label;
  return `${isInput ? UNLABELED_INPUT_PREFIX : UNLABELED_STEP_PREFIX}${stepId}`;
}

export function isUnlabeledInput(label: string): boolean {
  return label.startsWith(UNLABELED_INPUT_PREFIX);
}

export function isUnlabeledStep(label: string): boolean {
  return label.startsWith(UNLABELED_STEP_PREFIX);
}

export function isUnlabeled(label: string): boolean {
  return isUnlabeledInput(label) || isUnlabeledStep(label);
}

export function isAnonymousOutputLabel(label: string | null | undefined): boolean {
  return !label || label.startsWith("_anonymous_output_");
}

/**
 * Track labels assigned and generate anonymous ones for workflow outputs.
 */
export class Labels {
  private seenLabels = new Set<string>();
  private anonymousLabels = 0;

  ensureNewOutputLabel(label: string | null | undefined): string {
    if (label == null) {
      this.anonymousLabels += 1;
      label = `_anonymous_output_${this.anonymousLabels}`;
    }
    this.seenLabels.add(label);
    return label;
  }
}

/**
 * Render identity of a normalized step — the key visualizers (mermaid,
 * cytoscape) use to address a step's node and to resolve edge endpoints.
 *
 * This is `label || id`, mirroring how the format2 dict-step key flows into
 * the normalized model (`_normalizeSteps` sets `label = key` when no explicit
 * label is present, so `label || id` collapses to the dict key in the common
 * case). The raw-side counterpart `rawStepRenderIdentity` derives the SAME
 * identity from an un-normalized step dict, so a classifier walking the raw
 * draft (e.g. `resolveDraftOverlay`) keys its overlay the same way the
 * builders look nodes up.
 */
export function stepRenderIdentity(step: { label?: string | null; id: string }): string {
  return step.label || step.id;
}

/**
 * Raw-side counterpart of {@link stepRenderIdentity}. `iterKey` is the key the
 * raw-step iterator yielded (the dict map key for dict-form steps, or
 * `label || id` for list-form steps). An explicit `label:` on the step dict
 * overrides it — matching what normalization keeps and what the builders key
 * off.
 */
export function rawStepRenderIdentity(step: unknown, iterKey: string): string {
  if (
    typeof step === "object" &&
    step !== null &&
    typeof (step as Record<string, unknown>).label === "string" &&
    ((step as Record<string, unknown>).label as string).length > 0
  ) {
    return (step as Record<string, unknown>).label as string;
  }
  return iterKey;
}

/**
 * Parse a source reference into [step_label_or_id, output_name].
 *
 * Tries matching known labels first to handle labels containing '/'.
 * Falls back to split on '/' for numeric step IDs or unknown labels.
 */
export function resolveSourceReference(
  value: string,
  knownLabels: Map<string, number> | Set<string>,
): [string, string] {
  const labelKeys = knownLabels instanceof Map ? [...knownLabels.keys()] : [...knownLabels];
  // Sort by length descending to match longest label first
  labelKeys.sort((a, b) => b.length - a.length);

  for (const label of labelKeys) {
    if (value === label) {
      return [label, "output"];
    }
    if (value.startsWith(label + "/")) {
      return [label, value.slice(label.length + 1)];
    }
  }
  if (value.includes("/")) {
    const idx = value.indexOf("/");
    return [value.slice(0, idx), value.slice(idx + 1)];
  }
  return [value, "output"];
}

/** An all-digit step reference: a step index, which resolves without a label. */
export function isIndexRef(ref: string): boolean {
  return /^\d+$/.test(ref);
}

/**
 * Steps whose `label` differs from their `id` (the dict key in map form),
 * keyed by that id. Sources resolve by label, so a source naming one of these
 * ids resolves to nothing; this is what tells an author which label to use.
 */
export function format2ShadowedStepIds(wf: NormalizedFormat2Workflow): Map<string, string> {
  const shadowed = new Map<string, string>();
  for (const step of wf.steps) {
    if (step.label && step.id && step.label !== step.id) shadowed.set(step.id, step.label);
  }
  return shadowed;
}

/** Inputs whose `label` differs from their `id`, keyed by that label (inputs resolve by `id`). */
export function format2InputIdsByLabel(wf: NormalizedFormat2Workflow): Map<string, string> {
  const ids = new Map<string, string>();
  for (const inp of wf.inputs) {
    if (inp.label && inp.id && inp.label !== inp.id) ids.set(inp.label, inp.id);
  }
  return ids;
}

/** What a name that resolves to nothing is, when it names a step by id or an input by label. */
export interface UnresolvedSourceHint {
  /** Label of the step whose id is the name. */
  stepLabel?: string;
  /** Id of the input whose label is the name. */
  inputId?: string;
}

/**
 * Why `source` resolves to no step or input, given the step reference `ref`
 * parsed from it (always a prefix of `source`).
 */
export function unresolvedSourceMessage(
  source: string,
  ref: string,
  hint: UnresolvedSourceHint = {},
): string {
  const rest = source.slice(ref.length);
  if (hint.stepLabel != null) {
    return (
      `Cannot resolve '${source}': step '${ref}' has the label '${hint.stepLabel}', and sources ` +
      `resolve by label. Reference it as '${hint.stepLabel}${rest}', or set its label to '${ref}'`
    );
  }
  if (hint.inputId != null) {
    return (
      `Cannot resolve '${source}': input '${hint.inputId}' has the label '${ref}', and sources ` +
      `resolve inputs by id. Reference it as '${hint.inputId}${rest}'`
    );
  }
  return `Cannot resolve '${source}': no step or input has the label '${ref}'`;
}

/**
 * Thrown by Format2 → native conversion for a source that names no step or
 * input. gxformat2 (Python) fails on the same file with a bare `int()`
 * ValueError; this names the source instead.
 */
export class UnresolvedSourceError extends Error {
  constructor(
    readonly source: string,
    readonly ref: string,
    hint: UnresolvedSourceHint = {},
  ) {
    super(unresolvedSourceMessage(source, ref, hint));
    this.name = "UnresolvedSourceError";
  }
}

/** A step input source or workflow `outputSource` that conversion cannot resolve. */
export interface UnresolvedSource {
  /** Labels of the subworkflow steps leading to this one; empty at the top level. */
  path: string[];
  /** The step holding the source (`label ?? id`), or null for a workflow output. */
  step: string | null;
  /** The step input id, or the workflow output id. */
  input: string;
  source: string;
  /** Set when the source names a step by id or an input by label. */
  hint: UnresolvedSourceHint;
  message: string;
}

/**
 * Every source in `wf` that Format2 → native conversion cannot resolve:
 * step input sources (each a step's `label ?? id`, or an input's `id`, as
 * `format2StepLabelIndices` registers them) and workflow `outputSource`s.
 * Index references and stateful conversion's `runtime_value` placeholder pass. With
 * `recurse`, inline subworkflows are checked too, each against its own labels.
 */
export function unresolvedFormat2Sources(
  wf: NormalizedFormat2Workflow,
  options: { recurse?: boolean; path?: string[] } = {},
): UnresolvedSource[] {
  const path = options.path ?? [];
  const known = format2StepLabelIndices(wf);
  const shadowed = format2ShadowedStepIds(wf);
  const inputIds = format2InputIdsByLabel(wf);
  const found: UnresolvedSource[] = [];
  const check = (source: unknown, step: string | null, input: string): void => {
    if (typeof source !== "string") return;
    if (source === RUNTIME_VALUE_SOURCE && !known.has(source)) return;
    const [ref] = resolveSourceReference(source, known);
    if (known.has(ref) || isIndexRef(ref)) return;
    const hint: UnresolvedSourceHint = {};
    const stepLabel = shadowed.get(ref);
    const inputId = inputIds.get(ref);
    if (stepLabel != null) hint.stepLabel = stepLabel;
    else if (inputId != null) hint.inputId = inputId;
    found.push({
      path,
      step,
      input,
      source,
      hint,
      message: unresolvedSourceMessage(source, ref, hint),
    });
  };

  for (const step of wf.steps) {
    const stepName = step.label ?? step.id;
    for (const stepInput of step.in) {
      const sources = stepInput.source == null ? [] : [stepInput.source].flat();
      for (const source of sources) check(source, stepName, String(stepInput.id));
    }
    if (options.recurse && typeof step.run === "object" && step.run != null) {
      const sub = step.run as NormalizedFormat2Workflow;
      if (Array.isArray(sub.steps)) {
        found.push(...unresolvedFormat2Sources(sub, { ...options, path: [...path, stepName] }));
      }
    }
  }
  for (const output of wf.outputs ?? []) check(output.outputSource, null, output.id || "?");
  return found;
}

/** Order index of each input (by `id`) and step (by `label ?? id`) that conversion resolves references against. */
export function format2StepLabelIndices(wf: NormalizedFormat2Workflow): Map<string, number> {
  const labels = new Map<string, number>();
  wf.inputs.forEach((inp, i) => {
    if (inp.id) labels.set(inp.id, i);
  });
  wf.steps.forEach((step, j) => {
    const label = step.label ?? step.id;
    if (label) labels.set(label, wf.inputs.length + j);
  });
  return labels;
}
