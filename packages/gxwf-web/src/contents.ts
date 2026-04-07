/**
 * File CRUD operations mirroring the Jupyter Contents API shape.
 *
 * Pure functions — takes the target directory as an argument.
 * Port of Python's gxwf_web/contents.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CheckpointModel, ContentsModel } from "./models.js";

// ── Constants ────────────────────────────────────────────────────────

export const CHECKPOINTS_DIR = ".checkpoints";
const DEFAULT_CHECKPOINT_ID = "checkpoint";
const UNTITLED_FILE_STEM = "untitled";
const UNTITLED_DIRECTORY_STEM = "Untitled Folder";
/** Conflict detection tolerance in milliseconds (matches Python's 1s). */
const MTIME_TOLERANCE_MS = 1000;

const IGNORE_NAMES = new Set([
  ".git",
  "__pycache__",
  ".venv",
  "node_modules",
  ".ruff_cache",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  CHECKPOINTS_DIR,
]);
const IGNORE_SUFFIXES = [".pyc", ".pyo"];
const WORKFLOW_SUFFIXES = [".ga", ".gxwf.yml", ".gxwf.yaml"];

// ── Error type ───────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

// ── Path helpers ─────────────────────────────────────────────────────

export function isIgnored(name: string): boolean {
  if (IGNORE_NAMES.has(name)) return true;
  return IGNORE_SUFFIXES.some((s) => name.endsWith(s));
}

export function isWorkflowFile(relPath: string): boolean {
  return WORKFLOW_SUFFIXES.some((s) => relPath.endsWith(s));
}

/**
 * Resolve relPath under directory, rejecting traversal and symlink escapes.
 * Returns the absolute path.
 */
export function resolveSafePath(directory: string, relPath: string): string {
  directory = path.resolve(directory);

  if (relPath === "" || relPath === "/") {
    return directory;
  }

  if (path.isAbsolute(relPath)) {
    fail(400, "Path must be relative");
  }

  const joined = path.resolve(path.join(directory, relPath));
  if (joined !== directory && !joined.startsWith(directory + path.sep)) {
    fail(403, "Path escapes configured directory");
  }

  // Symlink escape check — only when the target exists (else realpath == joined).
  if (fs.existsSync(joined)) {
    const realJoined = fs.realpathSync(joined);
    const realDir = fs.realpathSync(directory);
    if (realJoined !== realDir && !realJoined.startsWith(realDir + path.sep)) {
      fail(403, "Path escapes configured directory via symlink");
    }
  }

  // Ignored component check.
  for (const part of relPath.replace(/\\/g, "/").split("/")) {
    if (part && isIgnored(part)) {
      fail(403, `Path contains ignored component: ${part}`);
    }
  }

  return joined;
}

// ── Mime type lookup ─────────────────────────────────────────────────

function guessMimetype(absPath: string): string | null {
  const ext = path.extname(absPath).toLowerCase();
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".ts": "text/plain",
    ".json": "application/json",
    ".xml": "application/xml",
    ".md": "text/markdown",
    ".ga": "application/json",
    ".yml": "text/yaml",
    ".yaml": "text/yaml",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
  };
  return map[ext] ?? null;
}

// ── Stat helpers ─────────────────────────────────────────────────────

function statTimes(absPath: string): { created: string; lastModified: string; size: number } {
  const st = fs.statSync(absPath);
  return {
    created: new Date(st.ctimeMs).toISOString(),
    lastModified: new Date(st.mtimeMs).toISOString(),
    size: st.size,
  };
}

function isWritable(absPath: string): boolean {
  try {
    fs.accessSync(absPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// ── File body read ───────────────────────────────────────────────────

function readFileBody(
  absPath: string,
  formatOverride?: string | null,
): { format: "text" | "base64"; content: string; mimetype: string | null } {
  const raw = fs.readFileSync(absPath);
  const mimetype = guessMimetype(absPath);
  const decoder = new TextDecoder("utf-8", { fatal: true });

  if (formatOverride === "text") {
    try {
      const text = decoder.decode(raw);
      return { format: "text", content: text, mimetype: mimetype ?? "text/plain" };
    } catch {
      fail(400, "File is not valid utf-8");
    }
  }

  if (formatOverride === "base64") {
    return {
      format: "base64",
      content: raw.toString("base64"),
      mimetype: mimetype ?? "application/octet-stream",
    };
  }

  if (formatOverride != null) {
    fail(400, `Unsupported format: ${formatOverride}`);
  }

  // Auto-detect: try UTF-8 first, fall back to base64.
  try {
    const text = decoder.decode(raw);
    return { format: "text", content: text, mimetype: mimetype ?? "text/plain" };
  } catch {
    return {
      format: "base64",
      content: raw.toString("base64"),
      mimetype: mimetype ?? "application/octet-stream",
    };
  }
}

// ── Public operations ────────────────────────────────────────────────

export function readContents(
  directory: string,
  relPath: string,
  includeContent = true,
  formatOverride?: string | null,
): ContentsModel {
  const absPath = resolveSafePath(directory, relPath);
  if (!fs.existsSync(absPath)) {
    fail(404, `Not found: ${relPath}`);
  }

  const name = path.basename(absPath) || path.basename(path.resolve(directory));
  const writable = isWritable(absPath);
  const { created, lastModified, size } = statTimes(absPath);

  if (fs.statSync(absPath).isDirectory()) {
    let children: ContentsModel[] | null = null;
    if (includeContent) {
      children = [];
      for (const entry of fs.readdirSync(absPath).sort()) {
        if (isIgnored(entry)) continue;
        const childRel = relPath ? `${relPath}/${entry}` : entry;
        children.push(readContents(directory, childRel, false));
      }
    }
    return {
      name,
      path: relPath,
      type: "directory",
      writable,
      created,
      last_modified: lastModified,
      size: null,
      mimetype: null,
      format: null,
      content: children,
    };
  }

  let format: "text" | "base64" | null = null;
  let content: string | null = null;
  let mimetype = guessMimetype(absPath);

  if (includeContent) {
    const body = readFileBody(absPath, formatOverride);
    format = body.format;
    content = body.content;
    mimetype = body.mimetype;
  }

  return {
    name,
    path: relPath,
    type: "file",
    writable,
    created,
    last_modified: lastModified,
    size,
    mimetype,
    format,
    content,
  };
}

export function writeContents(
  directory: string,
  relPath: string,
  model: ContentsModel,
  expectedMtime?: Date,
): ContentsModel {
  const absPath = resolveSafePath(directory, relPath);
  const parent = path.dirname(absPath);
  if (parent && !fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }

  // Conflict detection.
  if (expectedMtime !== undefined && fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
    const diskMtime = fs.statSync(absPath).mtimeMs;
    if (diskMtime - expectedMtime.getTime() > MTIME_TOLERANCE_MS) {
      fail(
        409,
        `File modified on disk since ${expectedMtime.toISOString()} (disk mtime ${new Date(diskMtime).toISOString()})`,
      );
    }
  }

  if (model.type === "directory") {
    fs.mkdirSync(absPath, { recursive: true });
  } else {
    const fmt = model.format ?? "text";
    if (fmt === "text") {
      const raw = typeof model.content === "string" ? model.content : "";
      fs.writeFileSync(absPath, raw, "utf-8");
    } else if (fmt === "base64") {
      const raw = typeof model.content === "string" ? model.content : "";
      fs.writeFileSync(absPath, Buffer.from(raw, "base64"));
    } else {
      fail(400, `Unsupported format: ${fmt}`);
    }
  }

  return readContents(directory, relPath, false);
}

export function deleteContents(directory: string, relPath: string): void {
  const absPath = resolveSafePath(directory, relPath);
  if (!fs.existsSync(absPath)) {
    fail(404, `Not found: ${relPath}`);
  }
  if (absPath === path.resolve(directory)) {
    fail(403, "Cannot delete configured root directory");
  }
  if (fs.statSync(absPath).isDirectory()) {
    fs.rmSync(absPath, { recursive: true });
  } else {
    fs.unlinkSync(absPath);
  }
  // Cascade: remove any checkpoints for this path.
  const cpDir = checkpointDirFor(directory, relPath);
  if (fs.existsSync(cpDir) && fs.statSync(cpDir).isDirectory()) {
    fs.rmSync(cpDir, { recursive: true });
  }
}

export function createUntitled(
  directory: string,
  parentRel: string,
  type: "file" | "directory",
  ext?: string | null,
): ContentsModel {
  const parentAbs = resolveSafePath(directory, parentRel);
  if (!fs.existsSync(parentAbs) || !fs.statSync(parentAbs).isDirectory()) {
    fail(404, `Parent directory not found: ${parentRel}`);
  }

  if (type === "file") {
    const stem = UNTITLED_FILE_STEM;
    let suffix = ext ?? "";
    if (suffix && !suffix.startsWith(".")) suffix = "." + suffix;
    for (let i = 0; ; i++) {
      const name = i === 0 ? `${stem}${suffix}` : `${stem}${i}${suffix}`;
      const candidateRel = parentRel ? `${parentRel}/${name}` : name;
      const candidateAbs = resolveSafePath(directory, candidateRel);
      if (!fs.existsSync(candidateAbs)) {
        fs.writeFileSync(candidateAbs, "", "utf-8");
        return readContents(directory, candidateRel, false);
      }
    }
  } else if (type === "directory") {
    const stem = UNTITLED_DIRECTORY_STEM;
    for (let i = 0; ; i++) {
      const name = i === 0 ? stem : `${stem} ${i}`;
      const candidateRel = parentRel ? `${parentRel}/${name}` : name;
      const candidateAbs = resolveSafePath(directory, candidateRel);
      if (!fs.existsSync(candidateAbs)) {
        fs.mkdirSync(candidateAbs);
        return readContents(directory, candidateRel, false);
      }
    }
  } else {
    fail(400, `Unsupported type: ${type}`);
  }
}

export function renameContents(
  directory: string,
  relPath: string,
  newRelPath: string,
): ContentsModel {
  const src = resolveSafePath(directory, relPath);
  const dst = resolveSafePath(directory, newRelPath);
  if (!fs.existsSync(src)) {
    fail(404, `Not found: ${relPath}`);
  }
  if (fs.existsSync(dst)) {
    fail(409, `Destination exists: ${newRelPath}`);
  }
  const parent = path.dirname(dst);
  if (parent && !fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  fs.renameSync(src, dst);
  // Cascade: move any checkpoints.
  const srcCp = checkpointDirFor(directory, relPath);
  if (fs.existsSync(srcCp) && fs.statSync(srcCp).isDirectory()) {
    const dstCp = checkpointDirFor(directory, newRelPath);
    fs.mkdirSync(path.dirname(dstCp), { recursive: true });
    fs.renameSync(srcCp, dstCp);
  }
  return readContents(directory, newRelPath, false);
}

// ── Checkpoint operations ─────────────────────────────────────────────

function checkpointDirFor(directory: string, relPath: string): string {
  return path.join(path.resolve(directory), CHECKPOINTS_DIR, relPath);
}

function checkpointModel(cpFile: string, cpId: string): CheckpointModel {
  const mtime = fs.statSync(cpFile).mtimeMs;
  return { id: cpId, last_modified: new Date(mtime).toISOString() };
}

export function createCheckpoint(directory: string, relPath: string): CheckpointModel {
  const absPath = resolveSafePath(directory, relPath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    fail(404, `File not found: ${relPath}`);
  }
  const cpDir = checkpointDirFor(directory, relPath);
  fs.mkdirSync(cpDir, { recursive: true });
  const cpFile = path.join(cpDir, DEFAULT_CHECKPOINT_ID);
  fs.copyFileSync(absPath, cpFile);
  // Preserve mtime via utimes (mirrors Python's shutil.copy2).
  const st = fs.statSync(absPath);
  fs.utimesSync(cpFile, st.atime, st.mtime);
  return checkpointModel(cpFile, DEFAULT_CHECKPOINT_ID);
}

export function listCheckpoints(directory: string, relPath: string): CheckpointModel[] {
  const absPath = resolveSafePath(directory, relPath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    fail(404, `File not found: ${relPath}`);
  }
  const cpDir = checkpointDirFor(directory, relPath);
  if (!fs.existsSync(cpDir) || !fs.statSync(cpDir).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(cpDir)
    .sort()
    .filter((entry) => {
      const f = path.join(cpDir, entry);
      return fs.statSync(f).isFile();
    })
    .map((entry) => checkpointModel(path.join(cpDir, entry), entry));
}

export function restoreCheckpoint(directory: string, relPath: string, checkpointId: string): void {
  const absPath = resolveSafePath(directory, relPath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    fail(404, `File not found: ${relPath}`);
  }
  const cpDir = checkpointDirFor(directory, relPath);
  const cpFile = path.join(cpDir, checkpointId);
  if (!fs.existsSync(cpFile) || !fs.statSync(cpFile).isFile()) {
    fail(404, `Checkpoint not found: ${checkpointId}`);
  }
  fs.copyFileSync(cpFile, absPath);
  // Preserve mtime (mirrors Python's shutil.copy2).
  const cpSt = fs.statSync(cpFile);
  fs.utimesSync(absPath, cpSt.atime, cpSt.mtime);
}

export function deleteCheckpoint(directory: string, relPath: string, checkpointId: string): void {
  resolveSafePath(directory, relPath); // validation only
  const cpDir = checkpointDirFor(directory, relPath);
  const cpFile = path.join(cpDir, checkpointId);
  if (!fs.existsSync(cpFile) || !fs.statSync(cpFile).isFile()) {
    fail(404, `Checkpoint not found: ${checkpointId}`);
  }
  fs.unlinkSync(cpFile);
  // Clean up empty checkpoint dir tree (mirrors Python's os.removedirs — walk up).
  let dir = cpDir;
  const root = path.resolve(directory);
  while (dir !== root) {
    try {
      fs.rmdirSync(dir); // throws if non-empty
    } catch {
      break;
    }
    dir = path.dirname(dir);
  }
}
