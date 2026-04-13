import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import { startHarness, type TestHarness } from "../src/harness.js";
import { byDescription, RunButton } from "../src/locators.js";

const NATIVE = "iwc/average-bigwig-between-replicates.ga";
const FORMAT2 = "synthetic/simple-format2.gxwf.yml";

function autoAcceptConfirm(page: Page): void {
  page.on("dialog", (d) => {
    void d.accept();
  });
}

test.describe.serial("convert .ga -> format2", () => {
  let harness: TestHarness;

  test.beforeAll(async () => {
    harness = await startHarness();
  });
  test.afterAll(async () => {
    await harness?.stop();
  });

  test("writes .gxwf.yml and removes .ga", async ({ page }) => {
    autoAcceptConfirm(page);
    const src = path.join(harness.workspaceDir, NATIVE);
    const dst = src.replace(/\.ga$/, ".gxwf.yml");

    await page.goto(`${harness.baseUrl}/workflow/${encodeURIComponent(NATIVE)}`);
    await page.locator(byDescription("convert tab")).click();
    await page.locator(byDescription(RunButton.convert)).click();

    // After convert, UI routes back to "/" — wait for disk state to settle
    // rather than a specific panel visibility.
    await expect.poll(() => fs.existsSync(dst), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => fs.existsSync(src), { timeout: 10_000 }).toBe(false);

    const parsed = YAML.parse(fs.readFileSync(dst, "utf8"));
    expect(parsed.class).toBe("GalaxyWorkflow");
  });
});

test.describe.serial("convert format2 -> .ga", () => {
  let harness: TestHarness;

  test.beforeAll(async () => {
    harness = await startHarness();
  });
  test.afterAll(async () => {
    await harness?.stop();
  });

  test("writes .ga and removes .gxwf.yml", async ({ page }) => {
    autoAcceptConfirm(page);
    const src = path.join(harness.workspaceDir, FORMAT2);
    const dst = src.replace(/\.gxwf\.yml$/, ".ga");

    await page.goto(`${harness.baseUrl}/workflow/${encodeURIComponent(FORMAT2)}`);
    await page.locator(byDescription("convert tab")).click();
    await page.locator(byDescription(RunButton.convert)).click();

    await expect.poll(() => fs.existsSync(dst), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => fs.existsSync(src), { timeout: 10_000 }).toBe(false);

    const parsed = JSON.parse(fs.readFileSync(dst, "utf8"));
    expect(parsed.a_galaxy_workflow).toBeDefined();
  });
});
