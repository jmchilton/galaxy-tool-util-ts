import { test, expect } from "@playwright/test";
import { byDescription, EditorToolbar, Monaco } from "../src/locators.js";
import {
  getMonacoValue,
  monacoHarnessSuite,
  openFileViaUrl,
  waitForLspReady,
  waitForMarkers,
  waitForMonaco,
} from "../src/monaco.js";

// Phase 5.5 — EditorToolbar behavior. One describe block so the harness boots
// once for the whole suite.
monacoHarnessSuite("monaco editor toolbar", ({ harness }) => {
  test("problems badge updates when the LSP flags errors", async ({ page }) => {
    const lspReady = waitForLspReady(page);
    await openFileViaUrl(page, harness().baseUrl, "synthetic/broken-format2.gxwf.yml");
    await waitForMonaco(page);
    await lspReady;

    // The LSP is ready, but validation may not have run for the buffer yet.
    await waitForMarkers(page, { severity: "error" });

    const badge = page.locator(byDescription(EditorToolbar.problemsBadge));
    await expect(badge).toBeVisible();
    const value = (await badge.innerText()).trim();
    expect(Number(value)).toBeGreaterThan(0);

    // Problems button carries danger styling when there are errors.
    const button = page.locator(byDescription(EditorToolbar.problems));
    await expect(button).toHaveClass(/problems-danger/);
  });

  test("palette button opens the VS Code quick-input widget", async ({ page }) => {
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    await page.locator(byDescription(EditorToolbar.palette)).click();
    await expect(page.locator(Monaco.quickInput).first()).toBeVisible();
  });

  test("find button opens the Monaco find widget", async ({ page }) => {
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    await page.locator(byDescription(EditorToolbar.find)).click();
    await expect(page.locator(".monaco-editor .editor-widget.find-widget").first()).toBeVisible();
  });

  test("undo reverts a typed edit", async ({ page }) => {
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    const original = await getMonacoValue(page);

    // Type something at the end of the doc via the hidden textarea Monaco uses
    // for input. Focus it first so the key goes to the active model.
    await page.locator(".monaco-editor textarea").first().focus();
    await page.keyboard.press("End");
    await page.keyboard.type("# scratch\n");

    const afterType = await getMonacoValue(page);
    expect(afterType).not.toBe(original);

    // Undo button is only enabled after a content change; wait for it.
    const undoBtn = page.locator(byDescription(EditorToolbar.undo));
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();

    const afterUndo = await getMonacoValue(page);
    expect(afterUndo).toBe(original);
  });

  test("toolbar save triggers a PUT to /api/contents", async ({ page }) => {
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    // Dirty the buffer so the server actually gets a save call — an identical
    // PUT still hits the endpoint, but typing mirrors real-world flow.
    await page.locator(".monaco-editor textarea").first().focus();
    await page.keyboard.press("End");
    await page.keyboard.type("# toolbar save\n");

    const savePromise = page.waitForRequest(
      (req) => req.method() === "PUT" && /\/api\/contents\//.test(req.url()),
      { timeout: 10_000 },
    );
    await page.locator(byDescription(EditorToolbar.save)).click();
    await savePromise;
  });

  test("Ctrl+S / Cmd+S keybinding triggers a PUT to /api/contents", async ({ page }) => {
    // Phase 6.2: the workbench.action.files.save command is overridden to call
    // FileView.onSave. Keybinding-side of the shared-handler contract (button
    // side is covered by the previous test).
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    await page.locator(".monaco-editor textarea").first().focus();
    await page.keyboard.press("End");
    await page.keyboard.type("# keybinding save\n");

    const savePromise = page.waitForRequest(
      (req) => req.method() === "PUT" && /\/api\/contents\//.test(req.url()),
      { timeout: 10_000 },
    );
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${mod}+s`);
    await savePromise;
  });
});
