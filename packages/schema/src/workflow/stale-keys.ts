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
