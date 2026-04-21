import { test, expect } from "@playwright/test";
import { Monaco } from "../src/locators.js";
import {
  monacoHarnessSuite,
  openFileViaUrl,
  waitForLspReady,
  waitForMonaco,
} from "../src/monaco.js";

// Phase 6.4 — keybinding coverage for the embedded Monaco editor. Scenarios
// originally planned as vitest unit tests; converted to e2e so the full
// monaco-vscode-api workbench is actually booted and the keybinding chain is
// exercised end-to-end (CommandsRegistry → KeybindingsRegistry → contribution
// handlers). Save / Ctrl+S is in monaco-toolbar.spec.ts alongside the button
// variant.

monacoHarnessSuite("monaco editor keybindings", ({ harness }) => {
  test("F1 opens the command palette from a focused editor", async ({ page }) => {
    // F1 is Monaco's editor-scoped keybinding for `editor.action.quickCommand`
    // — the same palette the toolbar button opens. Cmd/Ctrl+Shift+P is the
    // workbench-global equivalent (`workbench.action.showCommands`) and is
    // registered but not reliably dispatched in the standalone embed context;
    // F1 covers the editor-focus path users actually reach from the keyboard.
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    await page.locator(".monaco-editor textarea").first().focus();
    await page.keyboard.press("F1");
    await expect(page.locator(Monaco.quickInput).first()).toBeVisible();
  });

  test("command palette lists galaxy-workflows extension commands", async ({ page }) => {
    // Proves the palette is scoped to the loaded extension's contributions —
    // not just the built-in workbench commands. `cleanWorkflow` is one of the
    // extension's category-Galaxy commands (see contributes.commands in the
    // galaxy-workflows-vscode package.json).
    const lspReady = waitForLspReady(page);
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);
    await lspReady;

    await page.locator(".monaco-editor textarea").first().focus();
    await page.keyboard.press("F1");
    await expect(page.locator(Monaco.quickInput).first()).toBeVisible();

    // The palette's input is auto-focused; type to filter. Filter on the
    // category "Galaxy Workflows" rather than a specific command title —
    // commands with a `when` clause on resourceLangId aren't reliably visible
    // in the embed context (no active editor group), but category-scoped
    // commands without enablement clauses (e.g. `populateToolCache`) always
    // surface when the extension manifest is loaded.
    await page.keyboard.type("Galaxy Workflows");
    await expect(
      page.locator(`${Monaco.quickInput} .quick-input-list .monaco-list-row`).first(),
    ).toContainText(/Galaxy Workflows/i);
  });

  test("Ctrl+Space in a focused editor opens the suggest widget", async ({ page }) => {
    // End-to-end validation that: (a) the keybinding routes to the editor, and
    // (b) the extension's LSP registered at least one completion provider for
    // gxformat2. Position the cursor on a fresh top-level line so the YAML
    // LSP has concrete keys to offer (empty-line / end-of-buffer contexts
    // tend to resolve to nothing and silently hide the widget).
    const lspReady = waitForLspReady(page);
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);
    await lspReady;

    await page.evaluate(() => {
      const editor = window.__gxwfMonaco!.editor;
      const model = window.__gxwfMonaco!.model;
      // Append a blank line past the existing content so the cursor sits at a
      // fresh top-level position — completions should list the root schema's
      // remaining keys (the LSP returns an empty array when no keys fit).
      const last = model.getLineCount();
      editor.executeEdits("test", [
        {
          range: {
            startLineNumber: last,
            startColumn: model.getLineMaxColumn(last),
            endLineNumber: last,
            endColumn: model.getLineMaxColumn(last),
          },
          text: "\n",
        },
      ]);
      editor.setPosition({ lineNumber: last + 1, column: 1 });
      editor.focus();
    });
    // Ctrl+Space is the default regardless of platform.
    await page.keyboard.press("Control+Space");
    await expect(page.locator(Monaco.suggestWidget).first()).toBeVisible({ timeout: 5_000 });
  });
});
