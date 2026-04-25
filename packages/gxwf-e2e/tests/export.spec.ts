import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import { startHarness, type TestHarness } from "../src/harness.js";
import { byDescription, openOperationTab, ApplyButton, ResultPanel } from "../src/locators.js";

const NATIVE = "iwc/average-bigwig-between-replicates.ga";
const FORMAT2 = "synthetic/simple-format2.gxwf.yml";

test.describe.serial("export .ga -> format2", () => {
  let harness: TestHarness;

  test.beforeAll(async () => {
    harness = await startHarness();
  });
  test.afterAll(async () => {
    await harness?.stop();
  });

  test("writes .gxwf.yml alongside, original preserved", async ({ page }) => {
    const src = path.join(harness.workspaceDir, NATIVE);
    const dst = src.replace(/\.ga$/, ".gxwf.yml");
    const originalContent = fs.readFileSync(src, "utf8");
    expect(fs.existsSync(dst)).toBe(false);

    await page.goto(`${harness.baseUrl}/workflow/${encodeURIComponent(NATIVE)}`);
    await openOperationTab(page, "export");

    const panel = page.locator(byDescription(ResultPanel.export));
    await expect(panel.locator(".no-results")).toHaveCount(0, { timeout: 30_000 });

    await page.locator(byDescription(ApplyButton.export)).click();

    // Wait for disk write to settle after Apply.
    await expect.poll(() => fs.existsSync(dst), { timeout: 10_000 }).toBe(true);
    expect(fs.readFileSync(src, "utf8")).toBe(originalContent);

    // New file parses as YAML and looks like a format2 workflow.
    const parsed = YAML.parse(fs.readFileSync(dst, "utf8"));
    expect(parsed.class).toBe("GalaxyWorkflow");
  });
});

test.describe.serial("export format2 -> .ga", () => {
  let harness: TestHarness;

  test.beforeAll(async () => {
    harness = await startHarness();
  });
  test.afterAll(async () => {
    await harness?.stop();
  });

  test("writes .ga alongside, original preserved", async ({ page }) => {
    const src = path.join(harness.workspaceDir, FORMAT2);
    const dst = src.replace(/\.gxwf\.yml$/, ".ga");
    const originalContent = fs.readFileSync(src, "utf8");
    expect(fs.existsSync(dst)).toBe(false);

    await page.goto(`${harness.baseUrl}/workflow/${encodeURIComponent(FORMAT2)}`);
    await openOperationTab(page, "export");

    const panel = page.locator(byDescription(ResultPanel.export));
    await expect(panel.locator(".no-results")).toHaveCount(0, { timeout: 30_000 });

    await page.locator(byDescription(ApplyButton.export)).click();

    await expect.poll(() => fs.existsSync(dst), { timeout: 10_000 }).toBe(true);
    expect(fs.readFileSync(src, "utf8")).toBe(originalContent);

    // New file parses as JSON.
    const parsed = JSON.parse(fs.readFileSync(dst, "utf8"));
    expect(parsed.a_galaxy_workflow).toBeDefined();
  });
});
