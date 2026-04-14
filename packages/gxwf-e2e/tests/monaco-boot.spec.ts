import { test, expect } from "@playwright/test";
import { Monaco } from "../src/locators.js";
import {
  collectCspViolations,
  monacoHarnessSuite,
  openFileViaUrl,
  waitForMonaco,
} from "../src/monaco.js";

monacoHarnessSuite("monaco boot", ({ harness }) => {
  test("boots on a format2 file with gxformat2 language + no CSP violations", async ({ page }) => {
    const csp = collectCspViolations(page);

    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    const info = await page.evaluate(() => {
      const m = window.__gxwfMonaco!;
      return {
        editorCount: m.monaco.editor.getEditors().length,
        languageId: m.model.getLanguageId(),
        value: m.editor.getValue(),
      };
    });
    expect(info.editorCount).toBe(1);
    expect(info.languageId).toBe("gxformat2");
    expect(info.value).toContain("class: GalaxyWorkflow");

    csp.assertClean();
  });

  test("no orphan editors after route nav away + back", async ({ page }) => {
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    // Navigate away — FileView unmounts, MonacoEditor should dispose.
    await page.goto(`${harness().baseUrl}/`);
    await expect(page.locator(Monaco.readyHost)).toHaveCount(0);

    // Re-open the file and verify count returns to exactly 1 (no leak).
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    const count = await page.evaluate(() => window.__gxwfMonaco!.monaco.editor.getEditors().length);
    expect(count).toBe(1);
  });
});
