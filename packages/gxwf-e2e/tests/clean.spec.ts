import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { startHarness, type TestHarness } from "../src/harness.js";
import {
  byDescription,
  openOperationTab,
  RunButton,
  DryRunToggle,
  ResultPanel,
} from "../src/locators.js";

const DIRTY = "iwc/stale-keys.ga";

test.describe.serial("clean workflow", () => {
  let harness: TestHarness;
  let dirtyPath: string;
  let originalContent: string;

  test.beforeAll(async () => {
    harness = await startHarness();
    dirtyPath = path.join(harness.workspaceDir, DIRTY);
    originalContent = fs.readFileSync(dirtyPath, "utf8");
  });

  test.afterAll(async () => {
    await harness?.stop();
  });

  test("dry-run: report rendered, file unchanged", async ({ page }) => {
    await page.goto(`${harness.baseUrl}/workflow/${encodeURIComponent(DIRTY)}`);

    await openOperationTab(page, "clean");

    await page.locator(byDescription(DryRunToggle.clean)).click();

    await page.locator(byDescription(RunButton.clean)).click();

    // Report panel shows content (not the "No results yet" placeholder).
    const panel = page.locator(byDescription(ResultPanel.clean));
    await expect(panel.locator(".no-results")).toHaveCount(0, { timeout: 10_000 });

    // File on disk is byte-identical to the seed.
    const after = fs.readFileSync(dirtyPath, "utf8");
    expect(after).toBe(originalContent);
  });

  test("write: file on disk is cleaned", async ({ page }) => {
    await page.goto(`${harness.baseUrl}/workflow/${encodeURIComponent(DIRTY)}`);

    await openOperationTab(page, "clean");

    // Ensure dry-run is unchecked (default false; no-op if state persists from nav).
    const dryRun = page.locator(`${byDescription(DryRunToggle.clean)} input[type="checkbox"]`);
    if (await dryRun.isChecked()) {
      await page.locator(byDescription(DryRunToggle.clean)).click();
    }

    await page.locator(byDescription(RunButton.clean)).click();

    const panel = page.locator(byDescription(ResultPanel.clean));
    await expect(panel.locator(".no-results")).toHaveCount(0, { timeout: 10_000 });

    // File has been rewritten.
    const after = fs.readFileSync(dirtyPath, "utf8");
    expect(after).not.toBe(originalContent);

    // Stale keys removed from the cleaned file.
    expect(after).not.toContain("__page__");
    expect(after).not.toContain("__rerun_remap_job_id__");
    expect(after).not.toContain("chromInfo");
  });
});
