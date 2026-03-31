/**
 * Utilities for handling unlabelled objects when translating workflow formats.
 *
 * Port of gxformat2/_labels.py.
 */

export const UNLABELED_INPUT_PREFIX = "_unlabeled_input_";
export const UNLABELED_STEP_PREFIX = "_unlabeled_step_";

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
