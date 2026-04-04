/**
 * Shared tree-walking infrastructure for batch workflow operations.
 *
 * Provides a generic discover→load→process→aggregate loop so that
 * each tree command only supplies a per-workflow processing function
 * and an aggregation/formatting function.
 *
 * Mirrors Python's _tree_orchestrator.py pattern.
 */
import type { WorkflowFormat } from "@galaxy-tool-util/schema";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import * as YAML from "yaml";

// ── Types ──────────────────────────────────────────────────────────────

export interface WorkflowInfo {
  path: string;
  relativePath: string;
  format: WorkflowFormat;
}

export interface WorkflowOutcome<T> {
  info: WorkflowInfo;
  result?: T;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface TreeResult<T> {
  root: string;
  outcomes: WorkflowOutcome<T>[];
}

export interface TreeSummary {
  total: number;
  ok: number;
  fail: number;
  error: number;
  skipped: number;
}

/** Thrown by processOne to skip a workflow. */
class SkipWorkflow extends Error {}

/** Call from processOne to skip a workflow with a reason. */
export function skipWorkflow(reason: string): never {
  throw new SkipWorkflow(reason);
}

// ── Discovery ──────────────────────────────────────────────────────────

const EXCLUDE_DIRS = new Set([".git", ".hg", ".venv", "node_modules", "__pycache__", ".snakemake"]);
const NATIVE_EXTENSIONS = new Set([".ga"]);
const FORMAT2_SUFFIXES = [".gxwf.yml", ".gxwf.yaml"];

function classifyFile(filename: string): WorkflowFormat | null {
  // Check format2 compound extensions first
  for (const suffix of FORMAT2_SUFFIXES) {
    if (filename.endsWith(suffix)) return "format2";
  }
  const ext = extname(filename);
  if (NATIVE_EXTENSIONS.has(ext)) return "native";
  // Plain .json could be native, plain .yml/.yaml could be format2
  if (ext === ".json") return "native";
  if (ext === ".yml" || ext === ".yaml") return "format2";
  return null;
}

function isWorkflowContent(data: Record<string, unknown>, format: WorkflowFormat): boolean {
  if (format === "native") {
    return data.a_galaxy_workflow === "true";
  }
  return data.class === "GalaxyWorkflow";
}

function parseFileContent(raw: string, format: WorkflowFormat): Record<string, unknown> | null {
  try {
    if (format === "native") {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : null;
    }
    const parsed = YAML.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Discover workflow files recursively under root. */
export async function discoverWorkflows(
  root: string,
  includeFormat2 = true,
): Promise<WorkflowInfo[]> {
  const workflows: WorkflowInfo[] = [];
  await _walkDir(root, root, includeFormat2, workflows);
  workflows.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return workflows;
}

async function _walkDir(
  dir: string,
  root: string,
  includeFormat2: boolean,
  out: WorkflowInfo[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        await _walkDir(join(dir, entry.name), root, includeFormat2, out);
      }
      continue;
    }

    if (!entry.isFile()) continue;

    const format = classifyFile(entry.name);
    if (!format) continue;
    if (format === "format2" && !includeFormat2) continue;

    const filePath = join(dir, entry.name);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    const data = parseFileContent(raw, format);
    if (!data || !isWorkflowContent(data, format)) continue;

    out.push({
      path: filePath,
      relativePath: relative(root, filePath),
      format,
    });
  }
}

// ── Load ───────────────────────────────────────────────────────────────

/** Load and parse a discovered workflow file. Returns null on failure. */
export async function loadWorkflowSafe(
  info: WorkflowInfo,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(info.path, "utf-8");
    return parseFileContent(raw, info.format);
  } catch {
    return null;
  }
}

// ── Orchestrator ───────────────────────────────────────────────────────

export type ProcessOne<T> = (info: WorkflowInfo, data: Record<string, unknown>) => Promise<T> | T;

/** Discover, load, and process all workflows under a directory. */
export async function collectTree<T>(
  root: string,
  processOne: ProcessOne<T>,
  includeFormat2 = true,
): Promise<TreeResult<T>> {
  const workflows = await discoverWorkflows(root, includeFormat2);
  const outcomes: WorkflowOutcome<T>[] = [];

  for (const info of workflows) {
    const data = await loadWorkflowSafe(info);
    if (!data) {
      outcomes.push({ info, error: "Failed to load workflow" });
      continue;
    }

    try {
      const result = await processOne(info, data);
      outcomes.push({ info, result });
    } catch (e) {
      if (e instanceof SkipWorkflow) {
        outcomes.push({ info, skipped: true, skipReason: e.message });
      } else {
        outcomes.push({ info, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return { root, outcomes };
}

/** Compute a basic summary from tree outcomes. */
export function summarizeOutcomes<T>(
  outcomes: WorkflowOutcome<T>[],
  isFail?: (result: T) => boolean,
): TreeSummary {
  let ok = 0;
  let fail = 0;
  let error = 0;
  let skipped = 0;
  for (const o of outcomes) {
    if (o.error) {
      error++;
    } else if (o.skipped) {
      skipped++;
    } else if (isFail && o.result !== undefined && isFail(o.result)) {
      fail++;
    } else {
      ok++;
    }
  }
  return { total: outcomes.length, ok, fail, error, skipped };
}
