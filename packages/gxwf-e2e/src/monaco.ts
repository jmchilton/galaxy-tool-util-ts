import { expect, test, type Page } from "@playwright/test";
import { startHarness, type TestHarness } from "./harness.js";
import { Monaco } from "./locators.js";

// Test-only global installed by packages/gxwf-ui/src/components/MonacoEditor.vue
// when VITE_GXWF_EXPOSE_MONACO=1 (or DEV). Declared here (not in gxwf-ui src)
// so the handle surface doesn't leak into the shipping bundle's types. Loose
// `any`-shaped to avoid pulling monaco-editor types into this package.
declare global {
  interface MonacoTestHandle {
    monaco: any;
    editor: any;
    model: any;
  }
  interface Window {
    __gxwfMonaco?: MonacoTestHandle;
  }
}

// True when the opt-in Monaco fixture was detected by global-setup. Specs read
// this at import time and self-skip when false — default CI / fresh-clone runs
// stay green without a .vsix.
export const MONACO_ENABLED = process.env.GXWF_E2E_MONACO === "1";

export const SKIP_REASON =
  "Monaco E2E disabled. Drop packages/gxwf-ui/fixtures/galaxy-workflows.vsix" +
  " (see packages/gxwf-e2e/README.md) to enable.";

// Opens a file via the `/files/<path>` route. FileView reads route.params.path
// on mount and calls onFileSelect — equivalent to a user clicking through the
// tree, but without depending on the tree's lazy-load behavior.
export async function openFileViaUrl(page: Page, baseUrl: string, relPath: string): Promise<void> {
  const encoded = relPath.split("/").map(encodeURIComponent).join("/");
  await page.goto(`${baseUrl}/files/${encoded}`);
}

export async function waitForMonaco(page: Page, timeout = 15_000): Promise<void> {
  await page.locator(Monaco.readyHost).first().waitFor({ state: "visible", timeout });
  await page.waitForFunction(() => !!window.__gxwfMonaco?.editor, null, { timeout });
}

export async function getMonacoValue(page: Page): Promise<string> {
  return page.evaluate(() => window.__gxwfMonaco!.editor.getValue());
}

export async function typeInMonaco(page: Page, text: string): Promise<void> {
  await page.locator(".monaco-editor textarea").first().focus();
  await page.keyboard.type(text);
}

export async function triggerHoverAt(page: Page, line: number, column: number): Promise<void> {
  await page.evaluate(
    ({ line, column }) => {
      const editor = window.__gxwfMonaco!.editor;
      editor.setPosition({ lineNumber: line, column });
      editor.focus();
      editor.trigger("test", "editor.action.showHover", {});
    },
    { line, column },
  );
}

// Wait for the LSP server(s) contributed by the extension to finish activating.
// The extension logs "Galaxy Workflows (...) server is ready." when each LSP
// client finishes its start handshake; until then hover/diagnostic providers
// aren't registered and `editor.action.showHover` returns empty.
export async function waitForLspReady(page: Page, timeout = 20_000): Promise<void> {
  // Attach listener *before* the expected log fires — openFileViaUrl callers
  // should invoke this before navigation, or the handshake may already be done
  // by the time we attach. The handshake message is logged repeatedly on new
  // docs, though, so racing is tolerable in practice.
  await page.waitForEvent("console", {
    predicate: (msg) => /Galaxy Workflows .* server is ready/i.test(msg.text()),
    timeout,
  });
}

// Route-fulfills the extension loader's first fetch (package.json) with 404,
// driving MonacoEditor's `error` emit → FileView's monacoFailed flag. Shared
// across negative-path specs.
export async function blockExtensionLoad(page: Page): Promise<void> {
  await page.route("**/ext/galaxy-workflows/package.json", (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  );
}

// Marker-severity enum values in monaco.editor.MarkerSeverity. Stable across
// Monaco versions; duplicated here to avoid pulling monaco-editor types.
const SEVERITY: Record<"hint" | "info" | "warning" | "error", number> = {
  hint: 1,
  info: 2,
  warning: 4,
  error: 8,
};

export interface TestMarker {
  severity: number;
  message: string;
}

export async function getModelMarkers(page: Page): Promise<TestMarker[]> {
  return page.evaluate(() => {
    const m = window.__gxwfMonaco!;
    return m.monaco.editor
      .getModelMarkers({ resource: m.model.uri })
      .map((x: { severity: number; message: string }) => ({
        severity: x.severity,
        message: x.message,
      }));
  });
}

export async function waitForMarkers(
  page: Page,
  opts: {
    minCount?: number;
    severity?: "hint" | "info" | "warning" | "error";
    timeout?: number;
  } = {},
): Promise<void> {
  const { minCount = 1, severity, timeout = 20_000 } = opts;
  const target = severity !== undefined ? SEVERITY[severity] : null;
  await page.waitForFunction(
    ({ minCount, target }) => {
      const m = window.__gxwfMonaco;
      if (!m) return false;
      const markers = m.monaco.editor.getModelMarkers({ resource: m.model.uri });
      const pool =
        target !== null
          ? markers.filter((x: { severity: number }) => x.severity === target)
          : markers;
      return pool.length >= minCount;
    },
    { minCount, target },
    { timeout },
  );
}

// Test.describe.serial + beforeAll/afterAll harness lifecycle + MONACO_ENABLED
// skip, wrapped so Monaco specs can reduce to just their test() bodies. Yields
// a getter for the harness since it's only populated inside beforeAll.
export function monacoHarnessSuite(
  name: string,
  body: (ctx: { harness: () => TestHarness }) => void,
): void {
  test.describe.serial(name, () => {
    test.skip(!MONACO_ENABLED, SKIP_REASON);
    let h: TestHarness;
    test.beforeAll(async () => {
      h = await startHarness();
    });
    test.afterAll(async () => {
      await h?.stop();
    });
    body({ harness: () => h });
  });
}

// Attach CSP-violation + pageerror listeners to `page`. Returns a handle whose
// `assertClean` method fails the test if any violation was captured. Intended
// use:
//
//   const csp = collectCspViolations(page);
//   ... interact ...
//   csp.assertClean();
//
// See VS_CODE_MONACO_FIRST_E2E_PLAN.md (H3).
export function collectCspViolations(page: Page): {
  violations: string[];
  assertClean(): void;
} {
  const violations: string[] = [];
  page.on("pageerror", (err) => {
    if (/Content Security Policy/i.test(err.message)) {
      violations.push(`pageerror: ${err.message}`);
    }
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy/i.test(text)) {
      violations.push(`console: ${text}`);
    }
  });
  return {
    violations,
    assertClean() {
      expect(violations, `CSP violations captured:\n${violations.join("\n")}`).toEqual([]);
    },
  };
}
