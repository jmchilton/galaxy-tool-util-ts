// Guards against the Monaco editor leaking CSS into the rest of the app.
//
// Monaco-vscode-api injects stylesheets into document.head at runtime. Today
// every selector it injects is prefixed with `.monaco-*` or `.codicon-*`, so
// those rules never match PrimeVue components or app chrome. That property is
// what lets gxwf-ui mount Monaco alongside PrimeVue without the editor's
// styles clobbering buttons, forms, headers, etc.
//
// This test captures the stylesheets present on a Monaco-free page, mounts
// Monaco, then diffs. Any *new* stylesheet that ISN'T a known PrimeVue lazy-
// load (tagged `data-primevue-style-id`) is assumed to be Monaco-owned. Each
// such sheet is scanned for selectors that would reach out of the editor:
//
//   - Universal selectors: `*`
//   - Bare element selectors: `html`, `body`, `:root`, `:host`, and the bare
//     form-element + link selectors `button`, `a`, `input`, `textarea`,
//     `select`, `label`, `fieldset`, `form`, `table`, `tr`, `td`, `th`.
//
// A match means Monaco has started injecting rules that can affect non-editor
// elements. Depending on what the rule does, it might:
//
//   - repaint PrimeVue buttons/tables/tree/panels with editor-theme colors
//   - override app font-family globally
//   - change box-sizing/resets that break layouts elsewhere
//
// Responding to a failure:
//
//   1. Read the offending selector(s) in the failure message. They tell you
//      which rule in which newly-added stylesheet is the problem.
//   2. If a monaco-vscode-api upgrade introduced this, check whether the new
//      version added a service override that injects global styles (the
//      keybindings / theme / workbench service overrides are typical
//      offenders). Sometimes the fix is to drop an unnecessary override.
//   3. If the global selector is unavoidable, the editor has to be isolated.
//      Either wrap its mount in a shadow DOM (so the rules can't escape the
//      shadow root) or wrap the injected stylesheets in an `@layer` that the
//      app layer always overrides. Shadow DOM is the durable fix; CSS layers
//      are a lighter middle ground.
//   4. As a last resort, if the selector comes from an extension that ships
//      global CSS, report upstream and pin to the previous extension commit
//      until it's fixed.
//
// Do NOT respond by adding a new selector to the allowlist below unless you
// have confirmed the rule is genuinely scoped and the regex just can't tell.
// Adding to the allowlist is the equivalent of silencing a smoke detector.

import { expect, test } from "@playwright/test";
import { monacoHarnessSuite, openFileViaUrl, waitForMonaco } from "../src/monaco.js";

// A stylesheet is trusted (skipped by the scanner) if it carries one of these
// data-attributes. PrimeVue components lazy-register their own stylesheets on
// first render with `data-primevue-style-id`; those are app-owned, not
// Monaco-owned, and legitimately contain `:root,:host{...}` variable blocks.
const TRUSTED_SHEET_DATA_ATTRS = ["data-primevue-style-id"];

// Selectors that would reach outside `.monaco-*` / `.codicon-*` scope if
// Monaco started injecting them. Order matters for readability; add new
// entries alphabetically.
const GLOBAL_SELECTOR_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /(^|[\s,{}])\*\s*([,{\s>+~]|::?[a-z-]+)/,
    description: "universal selector (`*`)",
  },
  {
    pattern: /(^|[\s,{}])(html|body|:root|:host)\s*[\s.#:>[,{+~]/,
    description: "document root selector (html/body/:root/:host)",
  },
  {
    pattern:
      /(^|[\s,{}])(a|button|fieldset|form|input|label|select|table|textarea|td|th|tr)\s*[\s.#:>[,{+~]/,
    description: "bare element selector that could hit app chrome",
  },
];

// Splits a stylesheet into individual selector strings. Handles comma-
// separated selector lists by splitting on commas that sit outside parens
// (to avoid breaking up `:is(a, b)` pseudo-class arguments).
function collectSelectors(cssText: string): string[] {
  const selectors: string[] = [];
  // Pull the selector portion of every rule: everything before `{` that
  // isn't inside an @-rule declaration.
  const ruleHeads = cssText.match(/(^|})\s*[^{}@][^{}]*\{/g) ?? [];
  for (const head of ruleHeads) {
    const body = head.replace(/^[}]?\s*/, "").replace(/\{\s*$/, "");
    // Split on commas that aren't inside parens.
    let depth = 0;
    let buf = "";
    for (const ch of body) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        if (buf.trim()) selectors.push(buf.trim());
        buf = "";
      } else {
        buf += ch;
      }
    }
    if (buf.trim()) selectors.push(buf.trim());
  }
  return selectors;
}

interface RawSheet {
  index: number;
  dataAttrs: Record<string, string>;
  id: string | null;
  cssText: string;
}

async function snapshotStyleSheets(page: import("@playwright/test").Page): Promise<RawSheet[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("style")).map((el, index) => ({
      index,
      id: el.id || null,
      dataAttrs: Object.fromEntries(
        Array.from(el.attributes)
          .filter((a) => a.name.startsWith("data-"))
          .map((a) => [a.name, a.value]),
      ),
      cssText: el.textContent ?? "",
    }));
  });
}

function isTrustedSheet(sheet: RawSheet): boolean {
  return TRUSTED_SHEET_DATA_ATTRS.some((attr) => sheet.dataAttrs[attr] !== undefined);
}

interface Violation {
  sheetIndex: number;
  sheetId: string | null;
  sheetDataAttrs: Record<string, string>;
  selector: string;
  patternDescription: string;
}

function scanForViolations(sheets: RawSheet[]): Violation[] {
  const violations: Violation[] = [];
  for (const sheet of sheets) {
    if (isTrustedSheet(sheet)) continue;
    const selectors = collectSelectors(sheet.cssText);
    for (const selector of selectors) {
      for (const { pattern, description } of GLOBAL_SELECTOR_PATTERNS) {
        if (pattern.test(selector)) {
          violations.push({
            sheetIndex: sheet.index,
            sheetId: sheet.id,
            sheetDataAttrs: sheet.dataAttrs,
            selector,
            patternDescription: description,
          });
          break; // one violation per selector is enough — move on
        }
      }
    }
  }
  return violations;
}

function formatViolations(violations: Violation[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("Monaco started injecting CSS rules that can reach outside the editor.");
  lines.push("These rules will affect PrimeVue components and/or app chrome on any");
  lines.push("page — not just pages that mount the editor.");
  lines.push("");
  lines.push(`Found ${violations.length} offending selector(s):`);
  lines.push("");
  // Group by sheet for readability.
  const bySheet = new Map<number, Violation[]>();
  for (const v of violations) {
    if (!bySheet.has(v.sheetIndex)) bySheet.set(v.sheetIndex, []);
    bySheet.get(v.sheetIndex)!.push(v);
  }
  for (const [idx, group] of bySheet) {
    const first = group[0];
    const attrs = Object.entries(first.sheetDataAttrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    lines.push(`  <style> #${idx} id=${first.sheetId ?? "(none)"} ${attrs || "(no data attrs)"}`);
    // Cap selectors per sheet so a huge offender doesn't drown the output.
    const shown = group.slice(0, 10);
    for (const v of shown) {
      lines.push(`    - ${v.patternDescription}: ${v.selector.slice(0, 160)}`);
    }
    if (group.length > shown.length) {
      lines.push(`    ... and ${group.length - shown.length} more in this stylesheet`);
    }
  }
  lines.push("");
  lines.push("How to respond:");
  lines.push("  1. Identify which stylesheet the rules live in (id / data-attrs above)");
  lines.push("     — that usually points at a specific monaco-vscode-api service");
  lines.push("     override or at the loaded extension's contributed CSS.");
  lines.push("  2. If a recent monaco-vscode-api bump introduced this, consider whether");
  lines.push("     a service override can be dropped, or pin back to the prior version.");
  lines.push("  3. If the leak is genuine and unavoidable, isolate the editor host:");
  lines.push("       - preferred: mount Monaco inside a shadow DOM so injected <style>");
  lines.push("         nodes can't reach app-level elements;");
  lines.push("       - lighter: wrap the injected sheets in an `@layer` and order the");
  lines.push("         app layer above it so app rules win the cascade.");
  lines.push("  4. Do not add the selector to TRUSTED_SHEET_DATA_ATTRS in this spec");
  lines.push("     to silence the failure — that hides the regression.");
  return lines.join("\n");
}

monacoHarnessSuite("monaco css scoping", ({ harness }) => {
  test("monaco-owned stylesheets contain no globally-reaching selectors", async ({ page }) => {
    // Baseline: a page where Monaco has not loaded yet. Whatever <style>
    // nodes exist here are app-owned (Vite-emitted, PrimeVue-registered at
    // first render) and are the "allowed before" set.
    await page.goto(`${harness().baseUrl}/`);
    await page.waitForSelector("h1");
    const before = await snapshotStyleSheets(page);
    const beforeKeys = new Set(
      before.map((s) => `${s.id ?? ""}|${JSON.stringify(s.dataAttrs)}|${s.cssText.length}`),
    );

    // Mount Monaco by visiting a file. Wait for the editor to be live so we
    // know every stylesheet the boot path injects has landed.
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page, 30_000);
    // Give monaco-vscode-api a beat for any trailing style injection.
    await page.waitForTimeout(1000);

    const after = await snapshotStyleSheets(page);
    const added = after.filter(
      (s) => !beforeKeys.has(`${s.id ?? ""}|${JSON.stringify(s.dataAttrs)}|${s.cssText.length}`),
    );

    const violations = scanForViolations(added);

    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
