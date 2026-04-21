import { test, expect } from "@playwright/test";
import { Monaco } from "../src/locators.js";
import {
  monacoHarnessSuite,
  openFileViaUrl,
  triggerHoverAt,
  waitForLspReady,
  waitForMonaco,
} from "../src/monaco.js";

// synthetic/simple-format2.gxwf.yml starts with `class: GalaxyWorkflow` on
// line 1 — the format2 language server should produce a hover on `class`.
monacoHarnessSuite("monaco hover", ({ harness }) => {
  test("hover widget surfaces LSP content for `class:` in format2", async ({ page }) => {
    // Arm the LSP-ready listener *before* navigation so we don't miss the log.
    const lspReady = waitForLspReady(page);
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);
    await lspReady;

    // Position inside `class` on line 1 (1-indexed).
    await triggerHoverAt(page, 1, 3);

    const hover = page.locator(Monaco.hoverWidget).first();
    await expect(hover).toBeVisible({ timeout: 5_000 });
    // Hover body should carry schema-derived content rather than an empty
    // shell; we don't pin exact text because it tracks the format2 schema.
    const text = (await hover.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
  });
});
