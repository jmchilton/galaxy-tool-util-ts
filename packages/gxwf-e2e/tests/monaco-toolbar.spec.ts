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

    // Insert text via the editor's own edit API — `page.keyboard.type` against
    // Monaco's hidden textarea is timing-sensitive in the embed context (the
    // extension host's keybinding contributions can swallow individual keys).
    // The goal of this test is the toolbar Undo button's round-trip, not the
    // typing path itself, so drive the edit directly.
    await page.evaluate(() => {
      const editor = window.__gxwfMonaco!.editor;
      const model = window.__gxwfMonaco!.model;
      const last = model.getLineCount();
      const col = model.getLineMaxColumn(last);
      editor.executeEdits("test", [
        {
          range: {
            startLineNumber: last,
            startColumn: col,
            endLineNumber: last,
            endColumn: col,
          },
          text: "\n# scratch",
        },
      ]);
      editor.focus();
    });

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

  test("workbench.action.files.save routes to FileView.onSave", async ({ page }) => {
    // Phase 6.2: saveCommand.ts stacks a handler on the workbench save
    // command so Ctrl+S / Cmd+S — bound by monaco-vscode-api's default
    // keymap — route into FileView.onSave. Here we fire the command through
    // ICommandService, which is the same path the keybinding dispatcher
    // takes once a keypress resolves. Drives a raw keydown sequence from
    // Playwright is flaky under chromium-headless (Meta+S can be intercepted
    // by the browser shell); invoking the command directly validates the
    // override contract end-to-end and avoids that noise.
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page);

    // Dirty the buffer so the PUT actually ships new content.
    await page.evaluate(() => {
      const editor = window.__gxwfMonaco!.editor;
      const model = window.__gxwfMonaco!.model;
      const last = model.getLineCount();
      const col = model.getLineMaxColumn(last);
      editor.executeEdits("test", [
        {
          range: {
            startLineNumber: last,
            startColumn: col,
            endLineNumber: last,
            endColumn: col,
          },
          text: "\n# keybinding save",
        },
      ]);
    });

    const savePromise = page.waitForRequest(
      (req) => req.method() === "PUT" && /\/api\/contents\//.test(req.url()),
      { timeout: 10_000 },
    );
    await page.evaluate(() => window.__gxwfMonaco!.executeCommand!("workbench.action.files.save"));
    await savePromise;
  });
});
