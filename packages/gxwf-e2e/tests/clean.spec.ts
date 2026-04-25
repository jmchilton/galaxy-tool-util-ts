import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { startHarness, type TestHarness } from "../src/harness.js";
import { byDescription, openOperationTab, ApplyButton, ResultPanel } from "../src/locators.js";

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

  test("auto dry-run preview: report rendered, file unchanged", async ({ page }) => {
    await page.goto(`${harness.baseUrl}/workflow/${encodeURIComponent(DIRTY)}`);

    await openOperationTab(page, "clean");

    // Panel auto-fires a dry-run preview on open; wait for the placeholder to disappear.
    const panel = page.locator(byDescription(ResultPanel.clean));
    await expect(panel.locator(".no-results")).toHaveCount(0, { timeout: 10_000 });

    // File on disk is byte-identical to the seed.
    const after = fs.readFileSync(dirtyPath, "utf8");
    expect(after).toBe(originalContent);
  });

  test("apply: file on disk is cleaned", async ({ page }) => {
    await page.goto(`${harness.baseUrl}/workflow/${encodeURIComponent(DIRTY)}`);

    await openOperationTab(page, "clean");

    // Wait for the auto-preview to populate, then the Apply button becomes enabled.
    const panel = page.locator(byDescription(ResultPanel.clean));
    await expect(panel.locator(".no-results")).toHaveCount(0, { timeout: 10_000 });

    await page.locator(byDescription(ApplyButton.clean)).click();

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
