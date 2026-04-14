import { test, expect } from "@playwright/test";
import { Monaco } from "../src/locators.js";
import { blockExtensionLoad, monacoHarnessSuite, openFileViaUrl } from "../src/monaco.js";

// Phase 1.7 fallback-path coverage. Requires a Monaco build (the warn banner +
// EditorShell swap only exist when VITE_GXWF_MONACO=1) — hence the MONACO_ENABLED
// skip inside monacoHarnessSuite. The E2E plan called for a per-test rebuild
// with a bad VITE_GXWF_EXT_SOURCE; intercepting the extension fetch at the
// browser layer achieves the same failure signal without a second build.
monacoHarnessSuite("monaco fallback", ({ harness }) => {
  test("surfaces warn banner and renders EditorShell when the extension 404s", async ({ page }) => {
    await blockExtensionLoad(page);
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");

    await expect(page.locator(Monaco.failureBanner)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".editor-textarea")).toBeVisible();
    await expect(page.locator(Monaco.readyHost)).toHaveCount(0);
  });

  test("textarea edits propagate via onEdit (Save button enables)", async ({ page }) => {
    await blockExtensionLoad(page);
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await expect(page.locator(Monaco.failureBanner)).toBeVisible({ timeout: 20_000 });

    const textarea = page.locator(".editor-textarea");
    await textarea.focus();
    await textarea.press("End");
    await page.keyboard.type("\n# edit-from-fallback\n");

    // Save round-trips to gxwf-web; if the EditorShell's update:content didn't
    // reach FileView, the Save button would stay disabled on a pristine model.
    const saveResponse = page.waitForResponse(
      (resp) => resp.request().method() === "PUT" && /\/contents\//.test(resp.url()) && resp.ok(),
    );
    await page.getByRole("button", { name: "Save" }).click();
    await saveResponse;
  });
});
