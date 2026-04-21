import { test, expect } from "@playwright/test";
import { monacoHarnessSuite, openFileViaUrl, waitForMonaco } from "../src/monaco.js";

// Phase 1.9 — language-by-extension resolution. `foo-tests.gxwf.yml` resolves
// to gxformat2 because the TEST regex requires `-tests.yml`/`-tests.yaml` at
// the very end of the string; with `.gxwf` between `-tests` and `.yml`, the
// TEST branch doesn't match and the `.gxwf.yml` suffix (checked next) wins.

const cases: Array<{ path: string; expected: string }> = [
  { path: "synthetic/simple-native.ga", expected: "galaxyworkflow" },
  { path: "synthetic/simple-format2.gxwf.yml", expected: "gxformat2" },
  { path: "synthetic/simple-tests.yml", expected: "gxwftests" },
  { path: "synthetic/simple-tests.gxwf.yml", expected: "gxformat2" },
];

monacoHarnessSuite("monaco language detection", ({ harness }) => {
  for (const { path, expected } of cases) {
    test(`${path} → ${expected}`, async ({ page }) => {
      await openFileViaUrl(page, harness().baseUrl, path);
      await waitForMonaco(page);

      const languageId = await page.evaluate(() => window.__gxwfMonaco!.model.getLanguageId());
      expect(languageId).toBe(expected);
    });
  }
});
