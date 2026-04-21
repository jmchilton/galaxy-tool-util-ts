import { test, expect } from "@playwright/test";
import {
  getModelMarkers,
  monacoHarnessSuite,
  openFileViaUrl,
  waitForLspReady,
  waitForMarkers,
  waitForMonaco,
} from "../src/monaco.js";

// Phase 7 — LSP diagnostics surface as Monaco markers.
monacoHarnessSuite("monaco diagnostics", ({ harness }) => {
  test("broken format2 fixture produces at least one error marker", async ({ page }) => {
    const lspReady = waitForLspReady(page);
    await openFileViaUrl(page, harness().baseUrl, "synthetic/broken-format2.gxwf.yml");
    await waitForMonaco(page);
    await lspReady;

    // LSP handshake readiness doesn't guarantee validation has run against
    // the current doc, so poll until at least one error marker appears.
    await waitForMarkers(page, { severity: "error" });
    const markers = await getModelMarkers(page);
    expect(markers.length).toBeGreaterThan(0);
  });
});
