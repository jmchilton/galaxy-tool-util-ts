/**
 * Stale/bookkeeping key set for workflow tool_state.
 *
 * Mirrors Python's `galaxy.tool_util.workflow_state.stale_keys` set — keys
 * that Galaxy injects into tool_state for runtime bookkeeping and that are
 * not real parameter values. The state walker allows them through unknown-
 * key detection, and the roundtrip differ ignores them when diffing.
 *
 * Future work: classify into BOOKKEEPING / RUNTIME_LEAK / STALE_ROOT /
 * STALE_BRANCH / UNKNOWN to mirror Python's `stale_keys.py` and drive an
 * `--allow` / `--deny` policy for stateful export.
 */

/** Keys injected by Galaxy's runtime/UI; safe to ignore during conversion. */
export const STALE_KEYS: ReadonlySet<string> = new Set([
  "__current_case__",
  "__input_ext",
  "__page__",
  "__rerun_remap_job_id__",
  "__index__",
  "__job_resource",
  "chromInfo",
]);

/**
 * Runtime-leak key detection.
 *
 * These keys leak from job execution into persisted `tool_state` and are not
 * real parameter values. Galaxy classifies them as `RUNTIME_LEAK` in
 * `stale_keys.py`; its `for_export` policy preserves them through format2
 * export while `for_validate` flags them. Our walker silently drops them
 * during stateful conversion (neither side of the roundtrip keeps them), so
 * the roundtrip differ treats drops/appearances as benign.
 *
 * - Exact match: `__workflow_invocation_uuid__`
 * - Suffix match: `|__identifier__` (e.g. `input|__identifier__`,
 *   `dadaF|__identifier__` — collection element identifier, attached to
 *   whichever param received the collection)
 */
const RUNTIME_LEAK_EXACT: ReadonlySet<string> = new Set(["__workflow_invocation_uuid__"]);
const RUNTIME_LEAK_SUFFIX = "|__identifier__";

export function isRuntimeLeakKey(key: string): boolean {
  return RUNTIME_LEAK_EXACT.has(key) || key.endsWith(RUNTIME_LEAK_SUFFIX);
}
