#!/usr/bin/env node
/**
 * Sync upstream fixture files from Galaxy / gxformat2 checkouts using rsync.
 *
 * Usage:
 *   node scripts/sync-fixtures.mjs [--sync | --check] [--group <name>]
 *
 * Modes:
 *   --sync   Copy files from upstream into local fixtures (creates/updates)
 *   --check  Dry-run; report DIVERGED / MISSING / EXTRA without writing (default)
 *
 * Options:
 *   --group <name>  Limit to one manifest group; errors if src_root not set.
 *                   Without --group, skips groups whose src_root is unset.
 *
 * Env vars:
 *   GALAXY_ROOT      Path to Galaxy checkout
 *   GXFORMAT2_ROOT   Path to gxformat2 checkout
 *
 * DIVERGED / MISSING cause a non-zero exit.
 * EXTRA (local-only additions) are reported but do not fail.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const mode = argv.includes("--sync") ? "sync" : "check";
const groupIdx = argv.indexOf("--group");
const groupFilter = groupIdx !== -1 ? argv[groupIdx + 1] : null;

const ROOTS = {
  galaxy_root: process.env.GALAXY_ROOT ?? null,
  gxformat2_root: process.env.GXFORMAT2_ROOT ?? null,
};

const ENV_VAR_NAMES = {
  galaxy_root: "GALAXY_ROOT",
  gxformat2_root: "GXFORMAT2_ROOT",
};

const UPSTREAM_LABELS = {
  galaxy_root: "Galaxy",
  gxformat2_root: "gxformat2",
};

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/**
 * @typedef {{ src: string, dst: string, patterns?: string[], files?: string[] }} Entry
 * @typedef {{ name: string, label: string, src_root: string, entries: Entry[] }} Group
 * @typedef {{ groups: Group[] }} Manifest
 */

/** @type {Manifest} */
const manifest = JSON.parse(readFileSync(resolve(__dirname, "sync-manifest.json"), "utf-8"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a simple shell glob (no path separators) to a RegExp. */
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.replace(/\*/g, "[^/]*") + "$");
}

function matchesAny(filename, patterns) {
  return patterns.some((p) => globToRegex(p).test(filename));
}

/**
 * Run rsync for one entry.
 * @param {Entry} entry
 * @param {string} srcDir  Absolute path to source directory
 * @param {string} dstDir  Absolute path to destination directory
 * @param {{ dryRun: boolean }} opts
 */
function runRsync(entry, srcDir, dstDir, { dryRun }) {
  const baseArgs = [
    "--archive",
    "--checksum", // compare by content, not timestamp
    "--itemize-changes", // structured per-file output in both modes
  ];
  if (dryRun) baseArgs.push("--dry-run");

  let extraArgs;
  let filesFromInput = null;

  if (entry.files) {
    // Sync only the explicitly listed files.
    extraArgs = ["--files-from=-"];
    filesFromInput = entry.files.join("\n");
  } else {
    // Sync files matching the given patterns; exclude everything else.
    const patterns = entry.patterns ?? [];
    extraArgs = [...patterns.flatMap((p) => ["--include", p]), "--exclude", "*"];
  }

  const allArgs = [...baseArgs, ...extraArgs, srcDir + "/", dstDir + "/"];

  /** @type {import('node:child_process').SpawnSyncOptions} */
  const opts = { encoding: "utf-8" };
  if (filesFromInput !== null) opts.input = filesFromInput;

  return spawnSync("rsync", allArgs, opts);
}

/**
 * Parse rsync --itemize-changes output into structured issues.
 *
 * rsync itemize format: "YXcstpoguax path"
 *   Y = update type  (< > c h . *)
 *   X = file type    (f d L D S)
 *   position 2 = checksum flag: + (new file), c (changed), . (same)
 *
 * @param {string} stdout
 * @param {string} dstDir
 * @returns {Array<{ file: string, kind: 'missing' | 'diverged' }>}
 */
function parseItemizeOutput(stdout, dstDir) {
  const issues = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // Skip rsync stats lines
    if (/^(sending|sent |total size|Number of)/.test(line)) continue;

    // rsync descriptor is 9 chars: YX + 7 attribute flags, then space + path.
    // Y in {< > c h . *}, X = f for regular file
    const match = line.match(/^([<>ch.*])([fdLDS])(\S{7})\s+(.+)$/);
    if (!match) continue;

    const [, updateType, fileType, , filePath] = match;
    if (fileType !== "f") continue; // skip directories, symlinks, etc.
    // We only care about transfers (< or >), not unchanged (.) or messages (*)
    if (updateType !== ">" && updateType !== "<") continue;

    // Distinguish new vs. modified by checking whether dst file already exists.
    const localPath = join(dstDir, filePath);
    issues.push({
      file: filePath,
      kind: existsSync(localPath) ? "diverged" : "missing",
    });
  }
  return issues;
}

/**
 * Return files in dstDir matching patterns that have no counterpart in srcDir.
 * Only meaningful for pattern-based entries (files-based entries are curated lists).
 *
 * @param {string} srcDir
 * @param {string} dstDir
 * @param {string[]} patterns
 * @returns {string[]}
 */
function findExtras(srcDir, dstDir, patterns) {
  if (!existsSync(dstDir)) return [];
  const extras = [];
  for (const filename of readdirSync(dstDir)) {
    if (!matchesAny(filename, patterns)) continue;
    if (!existsSync(join(srcDir, filename))) extras.push(filename);
  }
  return extras;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const groups = groupFilter
  ? manifest.groups.filter((g) => g.name === groupFilter)
  : manifest.groups;

if (groupFilter && groups.length === 0) {
  console.error(`ERROR: No group '${groupFilter}' in sync-manifest.json`);
  process.exit(1);
}

let exitCode = 0;

for (const group of groups) {
  const srcRoot = ROOTS[group.src_root];
  const envVar = ENV_VAR_NAMES[group.src_root];
  const upstream = UPSTREAM_LABELS[group.src_root];

  if (!srcRoot) {
    if (groupFilter) {
      console.error(`ERROR: ${envVar} is not set. Point it at your ${upstream} checkout.`);
      process.exit(1);
    }
    console.log(`SKIP ${group.name} (${envVar} not set)`);
    continue;
  }

  console.log(`\n=== ${group.label} ===`);

  let groupHadIssues = false;

  for (const entry of group.entries) {
    const srcDir = resolve(srcRoot, entry.src);
    const dstDir = resolve(ROOT, entry.dst);
    const patterns = entry.files ? null : (entry.patterns ?? []);

    if (!existsSync(srcDir)) {
      console.error(`  ERROR: source not found: ${srcDir}`);
      groupHadIssues = true;
      continue;
    }

    if (mode === "sync") {
      mkdirSync(dstDir, { recursive: true });
    }

    const result = runRsync(entry, srcDir, dstDir, { dryRun: mode === "check" });

    if (result.error) {
      console.error(`  ERROR running rsync: ${result.error.message}`);
      groupHadIssues = true;
      continue;
    }
    if (result.status !== 0) {
      console.error(`  ERROR rsync exited ${result.status}: ${result.stderr.trim()}`);
      groupHadIssues = true;
      continue;
    }

    if (mode === "check") {
      const issues = parseItemizeOutput(result.stdout, dstDir);
      const extras = patterns ? findExtras(srcDir, dstDir, patterns) : [];

      if (issues.length === 0 && extras.length === 0) {
        console.log(`  OK        ${entry.src}`);
      } else {
        for (const { file, kind } of issues) {
          const label = kind === "missing" ? "MISSING  " : "DIVERGED ";
          console.log(`  ${label}  ${entry.src}${file}`);
          groupHadIssues = true;
        }
        for (const file of extras) {
          // Informational — local additions are intentional, not an error.
          console.log(`  EXTRA     ${entry.dst}${file}  (local addition, not in ${upstream})`);
        }
      }
    } else {
      // sync mode: reuse the same parser to count what was transferred
      const transferred = parseItemizeOutput(result.stdout, dstDir);
      if (transferred.length > 0) {
        const n = transferred.length;
        console.log(`  SYNCED    ${entry.src}  (${n} file${n === 1 ? "" : "s"})`);
      } else {
        console.log(`  OK        ${entry.src}  (up to date)`);
      }
    }
  }

  if (mode === "check" && groupHadIssues) {
    console.log(`  → Run: make sync-${group.name}`);
    exitCode = 1;
  }
}

console.log();
if (mode === "check") {
  if (exitCode === 0) console.log("All fixture groups in sync.");
  else console.log("Some fixtures need updating (see above).");
} else {
  console.log("Sync complete.");
}

process.exit(exitCode);
