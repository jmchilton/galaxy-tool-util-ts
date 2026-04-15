// Phase 5.1 — Monaco CSS inventory. Not a regression test — produces a
// markdown report + screenshots under packages/gxwf-e2e/.inventory/ to seed
// Phase 5.2 scoping decisions. Gated behind GXWF_E2E_INVENTORY=1 so it
// doesn't run in normal test/CI flows. Filename starts with `_` so ad-hoc
// filtering (`-g _inventory`) is easy.
//
//   GXWF_E2E_INVENTORY=1 pnpm --filter @galaxy-tool-util/gxwf-e2e test \
//     tests/_inventory-monaco-css.spec.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "@playwright/test";
import { E2E_ROOT } from "../src/paths.js";
import { monacoHarnessSuite, openFileViaUrl, waitForMonaco } from "../src/monaco.js";

const INVENTORY_ENABLED = process.env.GXWF_E2E_INVENTORY === "1";
const OUT_DIR = path.join(E2E_ROOT, ".inventory");

const PROBE_SELECTORS: Array<{ name: string; selector: string; textMatch?: string }> = [
  { name: "body", selector: "body" },
  { name: "h1", selector: "h1" },
  { name: "refresh-button", selector: "button", textMatch: "Refresh" },
  { name: "list-frame", selector: ".list-frame" },
  { name: "directory-path", selector: ".directory-path" },
];

const PROBE_PROPS = [
  "color",
  "background-color",
  "font-family",
  "font-size",
  "line-height",
  "border-radius",
  "border-color",
  "margin",
  "padding",
];

interface SheetInfo {
  id: string | null;
  dataAttrs: Record<string, string>;
  length: number;
  head: string;
  selectorSample: string[];
}
interface SheetSnapshot {
  sheets: SheetInfo[];
  linked: string[];
  sheetCount: number;
  totalBytes: number;
}
type ProbeRec = Record<string, string> | null;
type ProbeSnapshot = Record<string, ProbeRec>;

async function collectStyles(page: import("@playwright/test").Page): Promise<SheetSnapshot> {
  return page.evaluate(() => {
    const sheets: SheetInfo[] = [];
    for (const el of Array.from(document.querySelectorAll("style"))) {
      const text = el.textContent ?? "";
      sheets.push({
        id: el.id || null,
        dataAttrs: Object.fromEntries(
          Array.from(el.attributes)
            .filter((a) => a.name.startsWith("data-"))
            .map((a) => [a.name, a.value]),
        ),
        length: text.length,
        head: text.slice(0, 400),
        selectorSample: (text.match(/[^{]+\{/g) || []).slice(0, 8).map((s) => s.trim()),
      });
    }
    const linked = Array.from(document.querySelectorAll("link[rel='stylesheet']")).map(
      (l) => (l as HTMLLinkElement).href,
    );
    return {
      sheets,
      linked,
      sheetCount: sheets.length,
      totalBytes: sheets.reduce((n, s) => n + s.length, 0),
    };
  });
}

async function probe(page: import("@playwright/test").Page): Promise<ProbeSnapshot> {
  return page.evaluate(
    ({ selectors, props }) => {
      const out: Record<string, Record<string, string> | null> = {};
      for (const { name, selector, textMatch } of selectors) {
        const el: Element | null = textMatch
          ? (Array.from(document.querySelectorAll(selector)).find((n) =>
              (n.textContent ?? "").includes(textMatch),
            ) ?? null)
          : document.querySelector(selector);
        if (!el) {
          out[name] = null;
          continue;
        }
        const cs = getComputedStyle(el);
        const rec: Record<string, string> = {};
        for (const p of props) rec[p] = cs.getPropertyValue(p);
        out[name] = rec;
      }
      return out;
    },
    { selectors: PROBE_SELECTORS, props: PROBE_PROPS },
  );
}

function diffProbes(before: ProbeSnapshot, after: ProbeSnapshot): string {
  const lines: string[] = [];
  for (const { name } of PROBE_SELECTORS) {
    const b = before[name];
    const a = after[name];
    if (!b && !a) {
      lines.push(`- **${name}**: missing in both snapshots`);
      continue;
    }
    if (!b) {
      lines.push(`- **${name}**: absent before, present after`);
      continue;
    }
    if (!a) {
      lines.push(`- **${name}**: present before, absent after`);
      continue;
    }
    const changed = PROBE_PROPS.filter((p) => b[p] !== a[p]);
    if (changed.length === 0) {
      lines.push(`- **${name}**: no changes`);
    } else {
      lines.push(`- **${name}**: ${changed.length} prop(s) changed`);
      for (const p of changed) lines.push(`  - \`${p}\`: \`${b[p]}\` -> \`${a[p]}\``);
    }
  }
  return lines.join("\n");
}

function diffSheets(before: SheetSnapshot, after: SheetSnapshot): string {
  const lines: string[] = [];
  lines.push(
    `Stylesheets: ${before.sheetCount} -> ${after.sheetCount} (+${after.sheetCount - before.sheetCount})`,
  );
  lines.push(
    `Total inline CSS bytes: ${before.totalBytes.toLocaleString()} -> ${after.totalBytes.toLocaleString()} (+${(
      after.totalBytes - before.totalBytes
    ).toLocaleString()})`,
  );
  const beforeHeads = new Set(before.sheets.map((s) => s.head));
  const added = after.sheets.filter((s) => !beforeHeads.has(s.head));
  lines.push(`\n### Added stylesheets (${added.length})`);
  for (const s of added) {
    lines.push(
      `\n- **id**: \`${s.id ?? "(none)"}\` | **data**: \`${JSON.stringify(s.dataAttrs)}\` | **bytes**: ${s.length.toLocaleString()}`,
    );
    if (s.selectorSample.length) {
      lines.push("  - Sample selectors:");
      for (const sel of s.selectorSample) lines.push(`    - \`${sel.replace(/\n/g, " ")}\``);
    }
    lines.push(`  - Head: \`${s.head.replace(/\n/g, " ").slice(0, 200)}\``);
  }
  return lines.join("\n");
}

function scanGlobalBleed(
  after: SheetSnapshot,
): Array<{ id: string | null; dataAttrs: Record<string, string>; selector: string }> {
  const dangerous: Array<{
    id: string | null;
    dataAttrs: Record<string, string>;
    selector: string;
  }> = [];
  const globalRe = /(^|[\s,}])(html|body|:root|\*|button|a|input|textarea|select)\s*[\s.#:>[,{]/;
  for (const s of after.sheets) {
    for (const sel of s.selectorSample) {
      if (globalRe.test(sel)) {
        dangerous.push({ id: s.id, dataAttrs: s.dataAttrs, selector: sel });
      }
    }
  }
  return dangerous;
}

monacoHarnessSuite("phase 5.1 css inventory", ({ harness }) => {
  test.skip(!INVENTORY_ENABLED, "Set GXWF_E2E_INVENTORY=1 to run.");

  test("capture before/after inventory", async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const consoleLogs: Array<{ type: string; text: string }> = [];
    page.on("console", (m) => consoleLogs.push({ type: m.type(), text: m.text() }));

    // 1. Dashboard pre-Monaco
    await page.goto(`${harness().baseUrl}/`);
    await page.waitForSelector("h1");
    await page.screenshot({ path: path.join(OUT_DIR, "01-dashboard-before.png") });
    const dashProbeBefore = await probe(page);
    const sheetsBefore = await collectStyles(page);

    // 2. WorkflowView pre-Monaco (click first row if any)
    const firstRow = page.locator("[role='row']").first();
    let workflowClicked = false;
    if (await firstRow.count()) {
      await firstRow.click();
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: path.join(OUT_DIR, "02-workflow-before.png") });
      workflowClicked = true;
    }

    // 3. FileView — triggers Monaco mount
    await openFileViaUrl(page, harness().baseUrl, "synthetic/simple-format2.gxwf.yml");
    await waitForMonaco(page, 30_000);
    await page.waitForTimeout(1500); // trailing style injections
    await page.screenshot({ path: path.join(OUT_DIR, "03-fileview-monaco.png") });
    const sheetsAfter = await collectStyles(page);

    // 4. Dashboard post-Monaco
    await page.goto(`${harness().baseUrl}/`);
    await page.waitForSelector("h1");
    await page.screenshot({ path: path.join(OUT_DIR, "04-dashboard-after.png") });
    const dashProbeAfter = await probe(page);

    // 5. WorkflowView post-Monaco
    if (workflowClicked) {
      const row = page.locator("[role='row']").first();
      if (await row.count()) {
        await row.click();
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: path.join(OUT_DIR, "05-workflow-after.png") });
      }
    }

    const report = `# Phase 5.1 — Monaco CSS Inventory

Generated: ${new Date().toISOString()}

## Computed-style probes on Dashboard (pre- vs. post-Monaco)

${diffProbes(dashProbeBefore, dashProbeAfter)}

## Stylesheet inventory (Dashboard pre -> FileView with Monaco)

${diffSheets(sheetsBefore, sheetsAfter)}

## Global-selector bleed scan

Selectors in post-Monaco stylesheets that target \`html\` / \`body\` / \`:root\` / \`*\` / bare \`button\` / \`a\` / \`input\` / \`textarea\` / \`select\` — candidates most likely to leak into PrimeVue / app chrome. Only the first 8 selectors of each stylesheet are sampled.

${(() => {
  const bleed = scanGlobalBleed(sheetsAfter);
  return bleed.length === 0
    ? "None detected in the sampled selectors."
    : bleed
        .map(
          (g) =>
            `- id=\`${g.id ?? "(none)"}\` data=\`${JSON.stringify(g.dataAttrs)}\`: \`${g.selector.replace(/\n/g, " ")}\``,
        )
        .join("\n");
})()}

## Console (errors + warnings)

${
  consoleLogs
    .filter((l) => l.type === "error" || l.type === "warning")
    .map((l) => `- **${l.type}**: ${l.text}`)
    .join("\n") || "No errors or warnings."
}

## Screenshots

- \`01-dashboard-before.png\` — Dashboard before any Monaco code ran
- \`02-workflow-before.png\` — WorkflowView before Monaco mount
- \`03-fileview-monaco.png\` — FileView with Monaco live
- \`04-dashboard-after.png\` — Dashboard after Monaco mount (should match 01)
- \`05-workflow-after.png\` — WorkflowView after Monaco mount (should match 02)
`;
    fs.writeFileSync(path.join(OUT_DIR, "REPORT.md"), report);
    console.log(`[inventory] wrote ${path.join(OUT_DIR, "REPORT.md")}`);
  });
});
