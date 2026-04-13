/**
 * `data-description` values used by the UI for E2E locator targeting.
 * Follows the Galaxy convention: human-readable names, stable across DOM churn.
 *
 * Keep in sync with usages in packages/gxwf-ui/src.
 */

export const OperationTab = {
  validate: "validate tab",
  lint: "lint tab",
  clean: "clean tab",
  roundtrip: "roundtrip tab",
  export: "export tab",
  convert: "convert tab",
} as const;

export const RunButton = {
  validate: "run validate operation",
  lint: "run lint operation",
  clean: "run clean operation",
  roundtrip: "run roundtrip operation",
  export: "run export operation",
  convert: "run convert operation",
} as const;

export const DryRunToggle = {
  clean: "clean dry-run toggle",
  export: "export dry-run toggle",
  convert: "convert dry-run toggle",
} as const;

export const ResultPanel = {
  validate: "validate result panel",
  lint: "lint result panel",
  clean: "clean result panel",
  roundtrip: "roundtrip result panel",
  export: "export result panel",
  convert: "convert result panel",
} as const;

export const WorkflowList = {
  container: "workflow list",
  item: (relPath: string) => `workflow list item ${relPath}`,
} as const;

export function byDescription(value: string): string {
  return `[data-description="${value}"]`;
}
