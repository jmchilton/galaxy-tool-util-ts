/**
 * `data-description` values used by the UI for E2E locator targeting.
 * Follows the Galaxy convention: human-readable names, stable across DOM churn.
 *
 * Keep in sync with usages in packages/gxwf-ui/src.
 */

import type { Page } from "@playwright/test";

export const OperationTab = {
  validate: "validate panel",
  lint: "lint panel",
  clean: "clean panel",
  roundtrip: "roundtrip panel",
  export: "export panel",
  convert: "convert panel",
} as const;

export const ToolStripButton = {
  clean: "tool strip clean",
  lint: "tool strip lint",
  export: "tool strip export",
} as const;

const PRIMARY_OPS = new Set<keyof typeof OperationTab>(["clean", "lint", "export"]);

export const RunButton = {
  validate: "run validate operation",
  lint: "run lint operation",
  clean: "run clean operation",
  roundtrip: "run roundtrip operation",
  export: "run export operation",
  convert: "run convert operation",
} as const;

export const ApplyButton = {
  clean: "apply clean operation",
  export: "apply export operation",
  convert: "apply convert operation",
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

/**
 * Open an operation's result drawer. Clean/Lint/Export are primary tool-strip
 * buttons; Validate/Roundtrip/Convert live behind the ⋯ advanced-operations menu.
 */
export async function openOperationTab(page: Page, op: keyof typeof OperationTab): Promise<void> {
  if (PRIMARY_OPS.has(op)) {
    await page.locator(byDescription(`tool strip ${op}`)).click();
  } else {
    await page.locator(byDescription("advanced operations menu")).click();
    await page
      .locator(byDescription("advanced operations menu popup"))
      .getByRole("menuitem", { name: new RegExp(`^${op}$`, "i") })
      .click();
  }
  await page.locator(byDescription(OperationTab[op])).waitFor({ state: "visible" });
}

export const Monaco = {
  readyHost: "[data-monaco-ready='true']",
  hoverWidget: "div.monaco-hover",
  suggestWidget: ".suggest-widget",
  quickInput: ".quick-input-widget",
  failureBanner: "text=/Monaco editor failed to load/",
} as const;

export const EditorToolbar = {
  root: "editor toolbar",
  save: "editor toolbar save",
  undo: "editor toolbar undo",
  redo: "editor toolbar redo",
  format: "editor toolbar format",
  find: "editor toolbar find",
  palette: "editor toolbar palette",
  problems: "editor toolbar problems",
  problemsBadge: "editor toolbar problems badge",
} as const;
