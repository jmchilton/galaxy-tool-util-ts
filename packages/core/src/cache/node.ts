import { join } from "node:path";
import { homedir } from "node:os";

import { FilesystemCacheStorage } from "./storage/filesystem.js";
import { ToolCache, type ToolCacheOptions } from "./tool-cache.js";
import { CACHE_DIR_ENV_VAR } from "./tool-cache-defaults.js";
import type { ToolInfoOptions } from "../tool-info.js";
import type { DiagnosticSink } from "../diagnostics.js";
import { ToolInfoService } from "../tool-info.js";

export { FilesystemCacheStorage } from "./storage/filesystem.js";
export { CACHE_DIR_ENV_VAR } from "./tool-cache-defaults.js";

/** Default cache directory: `~/.galaxy/tool_info_cache`. */
export const DEFAULT_CACHE_DIR = join(homedir(), ".galaxy", "tool_info_cache");

/** Resolve cache directory: explicit override > env var > default. */
export function getCacheDir(override?: string): string {
  return override ?? process.env[CACHE_DIR_ENV_VAR] ?? DEFAULT_CACHE_DIR;
}

const stderrDiagnostic: DiagnosticSink = (message) => console.error(message);

/** Options for `makeNodeToolCache` — same as ToolCache minus `storage`, plus `cacheDir`. */
export interface NodeToolCacheOptions extends Omit<ToolCacheOptions, "storage"> {
  cacheDir?: string;
}

/**
 * Construct a ToolCache backed by the default filesystem storage.
 * `cacheDir` resolves via {@link getCacheDir} (explicit > env var > default).
 * Recoverable diagnostics go to stderr unless `onDiagnostic` overrides the sink.
 */
export function makeNodeToolCache(opts?: NodeToolCacheOptions): ToolCache {
  const cacheDir = getCacheDir(opts?.cacheDir);
  return new ToolCache({
    ...opts,
    storage: new FilesystemCacheStorage(cacheDir),
    onDiagnostic: opts?.onDiagnostic ?? stderrDiagnostic,
  });
}

/** Options for `makeNodeToolInfoService` — ToolInfoOptions without `storage`, plus `cacheDir`. */
export interface NodeToolInfoOptions extends Omit<ToolInfoOptions, "storage"> {
  cacheDir?: string;
}

/**
 * Construct a ToolInfoService backed by the default filesystem storage.
 * `cacheDir` resolves via {@link getCacheDir}.
 * Recoverable diagnostics go to stderr unless `onDiagnostic` overrides the sink.
 */
export function makeNodeToolInfoService(opts?: NodeToolInfoOptions): ToolInfoService {
  const cacheDir = getCacheDir(opts?.cacheDir);
  return new ToolInfoService({
    ...opts,
    storage: new FilesystemCacheStorage(cacheDir),
    onDiagnostic: opts?.onDiagnostic ?? stderrDiagnostic,
  });
}
