#!/usr/bin/env node
/**
 * Regenerate Tool Shed API fixtures used by search / CLI tests.
 *
 * Usage:
 *   node scripts/regen-toolshed-fixtures.mjs            # regenerate all
 *   node scripts/regen-toolshed-fixtures.mjs --check    # fetch + diff (no write)
 *   node scripts/regen-toolshed-fixtures.mjs --only fastqc-page1
 *
 * Output is minified JSON (matching the checked-in format).
 *
 * Excluded intentionally:
 *   - toolshed-search/with-optional-fields.json — synthetic (toolshed.example)
 *   - core/test/fixtures/fastqc-parsed-tool.json — derived ParsedTool, not a raw endpoint capture
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TOOLSHED = "https://toolshed.g2.bx.psu.edu";

const FIXTURES = [
  {
    name: "fastqc-page1",
    url: `${TOOLSHED}/api/tools?q=fastqc&page=1&page_size=3`,
    out: "packages/search/test/fixtures/toolshed-search/fastqc-page1.json",
  },
  {
    name: "empty-search",
    url: `${TOOLSHED}/api/tools?q=zzzzzzz_no_such_tool_query_xyz&page=1&page_size=10`,
    out: "packages/search/test/fixtures/toolshed-search/empty.json",
  },
  {
    name: "trs-versions-fastqc",
    url: `${TOOLSHED}/api/ga4gh/trs/v2/tools/devteam~fastqc~fastqc/versions`,
    out: "packages/core/test/fixtures/trs-versions/fastqc.json",
  },
  {
    name: "revisions-fastqc-repo",
    url: `${TOOLSHED}/api/repositories?owner=devteam&name=fastqc`,
    out: "packages/search/test/fixtures/toolshed-revisions/fastqc-repo.json",
  },
  {
    // `metadata` needs the encoded repo id; resolved dynamically below from revisions-fastqc-repo.
    name: "revisions-fastqc-metadata",
    urlFrom: (ctx) => `${TOOLSHED}/api/repositories/${ctx["revisions-fastqc-repo"][0].id}/metadata?downloadable_only=true`,
    out: "packages/search/test/fixtures/toolshed-revisions/fastqc-metadata.json",
    dependsOn: ["revisions-fastqc-repo"],
  },
  {
    name: "revisions-fastqc-ordered",
    url: `${TOOLSHED}/api/repositories/get_ordered_installable_revisions?owner=devteam&name=fastqc`,
    out: "packages/search/test/fixtures/toolshed-revisions/fastqc-ordered.json",
  },
];

const argv = process.argv.slice(2);
const check = argv.includes("--check");
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

const ctx = {};
let changed = 0;
let same = 0;

for (const f of FIXTURES) {
  if (only && f.name !== only) continue;
  const url = f.urlFrom ? f.urlFrom(ctx) : f.url;
  process.stdout.write(`[${f.name}] ${url} ... `);
  const data = await fetchJson(url);
  ctx[f.name] = data;
  const serialized = JSON.stringify(data);
  const target = resolve(ROOT, f.out);

  let existing = null;
  try {
    existing = readFileSync(target, "utf8").trimEnd();
  } catch {
    /* new file */
  }

  if (existing === serialized) {
    console.log("unchanged");
    same += 1;
    continue;
  }

  if (check) {
    console.log("DIVERGED");
    changed += 1;
    continue;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, serialized);
  console.log(existing === null ? "written (new)" : "updated");
  changed += 1;
}

console.log(`\n${changed} changed, ${same} unchanged`);
if (check && changed > 0) process.exit(1);
