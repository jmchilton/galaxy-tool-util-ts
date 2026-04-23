import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { startHarness, type TestHarness } from "../src/harness.js";
import { byDescription, openOperationTab, RunButton, ResultPanel } from "../src/locators.js";

const WF = "iwc/parallel-accession-download.ga";

test.describe.serial("roundtrip workflow", () => {
  let harness: TestHarness;
  let wfPath: string;
  let originalContent: string;

  test.beforeAll(async () => {
    harness = await startHarness();
    wfPath = path.join(harness.workspaceDir, WF);
    originalContent = fs.readFileSync(wfPath, "utf8");
  });

  test.afterAll(async () => {
    await harness?.stop();
  });

  test("report rendered, file unchanged (read-only)", async ({ page }) => {
    await page.goto(`${harness.baseUrl}/workflow/${encodeURIComponent(WF)}`);

    await openOperationTab(page, "roundtrip");
    await page.locator(byDescription(RunButton.roundtrip)).click();

    const panel = page.locator(byDescription(ResultPanel.roundtrip));
    await expect(panel.locator(".no-results")).toHaveCount(0, { timeout: 20_000 });

    // Read-only operation — file byte-identical.
    expect(fs.readFileSync(wfPath, "utf8")).toBe(originalContent);
  });
});
