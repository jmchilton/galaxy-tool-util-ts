/**
 * Shared helper for reading a native step's `tool_state`.
 *
 * Native workflows store parameter state as either:
 *   - a JSON-encoded string (`.ga` on disk), or
 *   - a parsed dict (after normalization / in-memory manipulation).
 *
 * Consumers elsewhere in the package duplicated this logic (cross-check
 * extractor, normalized native builder, clean). Kept here as the shared
 * root. `clean.ts` wraps this with legacy-dict decoding; it's a superset, not
 * a replacement.
 */
export function parseToolState(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    if (raw === "") return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* fall through to empty */
    }
    return {};
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}
