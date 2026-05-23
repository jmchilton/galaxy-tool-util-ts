/**
 * Inline UDT resolver layered over `GetToolInfo`. TS port of Python's
 * `galaxy.tool_util.workflow_state._inline_tool.{resolve_for_step,
 * InlineResolver, ensure_inline_resolver}` — the connection-validation surface
 * for inline `tool_representation` steps. Without this, inline-UDT steps
 * resolve to empty inputs/outputs (their `tool_id` is `null`).
 *
 * Scope discrimination:
 *  - `class: GalaxyUserTool` → parse locally and return.
 *  - `class: GalaxyTool` (admin dynamic tool) → return `null` so the caller can
 *    emit `inline_source_unsupported`.
 *  - Both `tool_id` and `tool_representation` set → `tool_representation` wins
 *    (Galaxy's exporter clears `tool_id` on UDT export but third-party exporters
 *    might not).
 */

import type { ParsedTool } from "@galaxy-tool-util/schema";
import { parseInlineTool } from "@galaxy-tool-util/schema";

import type { GetToolInfo } from "./get-tool-info.js";

type Dict = Record<string, unknown>;

const INLINE_CLASSES = new Set(["GalaxyUserTool", "GalaxyTool"]);

interface InlineStepView {
  toolId: string | null;
  toolVersion: string | null;
  representation: Dict | null;
  inlineClass: "GalaxyUserTool" | "GalaxyTool" | null;
}

function viewStep(step: unknown): InlineStepView {
  if (!step || typeof step !== "object") {
    return { toolId: null, toolVersion: null, representation: null, inlineClass: null };
  }
  const s = step as Dict;
  const representation = pickRepresentation(s);
  const inlineClass =
    representation &&
    typeof representation.class === "string" &&
    INLINE_CLASSES.has(representation.class)
      ? (representation.class as "GalaxyUserTool" | "GalaxyTool")
      : null;
  return {
    toolId: typeof s.tool_id === "string" ? s.tool_id : null,
    toolVersion: typeof s.tool_version === "string" ? s.tool_version : null,
    representation,
    inlineClass,
  };
}

function pickRepresentation(step: Dict): Dict | null {
  const native = step.tool_representation;
  if (native && typeof native === "object" && !Array.isArray(native)) {
    return native as Dict;
  }
  const run = step.run;
  if (run && typeof run === "object" && !Array.isArray(run)) {
    const cls = (run as Dict).class;
    if (typeof cls === "string" && INLINE_CLASSES.has(cls)) {
      return run as Dict;
    }
  }
  return null;
}

export function resolveForStep(getToolInfo: GetToolInfo, step: unknown): ParsedTool | undefined {
  if (getToolInfo instanceof InlineResolver) {
    return getToolInfo.resolve(step);
  }
  return _resolveForStepUncached(getToolInfo, step);
}

function _resolveForStepUncached(getToolInfo: GetToolInfo, step: unknown): ParsedTool | undefined {
  const view = viewStep(step);
  if (view.inlineClass !== null) {
    if (view.inlineClass !== "GalaxyUserTool") {
      // GalaxyTool admin dynamic tool — out of scope for connection validation.
      return undefined;
    }
    if (view.representation === null) return undefined;
    return parseInlineTool(view.representation);
  }
  if (!view.toolId) return undefined;
  return getToolInfo.getToolInfo(view.toolId, view.toolVersion);
}

/**
 * Per-walk memoization layered over {@link resolveForStep}. Wraps a
 * {@link GetToolInfo} and caches per-step parse results so repeated
 * `resolveForStep` calls on the same step object — common when multiple
 * validation phases walk the same workflow — re-use one parse invocation.
 *
 * Structurally satisfies `GetToolInfo` by delegating `getToolInfo(toolId,
 * version)` to the wrapped instance, so callers can pass an `InlineResolver`
 * anywhere a `GetToolInfo` is expected.
 *
 * Keyed by step identity (`WeakMap`) — content-hash dedupe deferred until
 * profiling says it matters. Lifetime is bound to a single workflow walk.
 */
export class InlineResolver implements GetToolInfo {
  private readonly inner: GetToolInfo;
  // Keyed by representation-dict identity rather than step identity so the
  // cache survives normalization (toNative/normalizedNative rebuild steps but
  // keep the inline `tool_representation` leaf by reference).
  private readonly representationCache = new WeakMap<object, ParsedTool>();

  constructor(getToolInfo: GetToolInfo) {
    this.inner = getToolInfo;
  }

  getToolInfo(toolId: string, toolVersion?: string | null): ParsedTool | undefined {
    return this.inner.getToolInfo(toolId, toolVersion);
  }

  resolve(step: unknown): ParsedTool | undefined {
    const view = viewStep(step);
    if (view.inlineClass !== null) {
      if (view.inlineClass !== "GalaxyUserTool") return undefined;
      if (view.representation === null) return undefined;
      return this.parseInlineOnce(view.representation);
    }
    if (!view.toolId) return undefined;
    return this.inner.getToolInfo(view.toolId, view.toolVersion);
  }

  /**
   * Parse a single inline representation and cache it by representation
   * identity. Public so callers (e.g. `buildGetToolInfo`) can warm the cache
   * up-front during preload to surface parse errors before graph build.
   */
  parseInlineOnce(representation: Dict): ParsedTool {
    const key = representation as object;
    const cached = this.representationCache.get(key);
    if (cached) return cached;
    const parsed = parseInlineTool(representation);
    this.representationCache.set(key, parsed);
    return parsed;
  }
}

/**
 * Walk a workflow dict (steps + nested subworkflows + nested `run`) and
 * collect every inline tool representation. Used by `buildGetToolInfo` to
 * pre-parse inline tools alongside the async tool_id preload.
 */
export interface InlineToolEntry {
  representation: Dict;
  inlineClass: "GalaxyUserTool" | "GalaxyTool";
}

export function collectInlineTools(data: Dict): InlineToolEntry[] {
  const out: InlineToolEntry[] = [];
  _walkInline(data, out);
  return out;
}

function _walkInline(node: Dict, out: InlineToolEntry[]): void {
  const steps = node.steps;
  if (steps == null || typeof steps !== "object") return;
  const iter: Iterable<unknown> = Array.isArray(steps)
    ? (steps as unknown[])
    : Object.values(steps as Dict);
  for (const stepRaw of iter) {
    if (stepRaw == null || typeof stepRaw !== "object") continue;
    const step = stepRaw as Dict;
    const view = viewStep(step);
    if (view.representation && view.inlineClass) {
      out.push({ representation: view.representation, inlineClass: view.inlineClass });
    }
    const sub = step.subworkflow;
    if (sub && typeof sub === "object" && !Array.isArray(sub)) {
      _walkInline(sub as Dict, out);
    }
    // For format2, `run:` may be a nested subworkflow (class: GalaxyWorkflow)
    // — recurse so inner UDTs surface too. If `run:` is itself an inline UDT,
    // viewStep already picked it up above; don't recurse in that case.
    const run = step.run;
    if (
      run &&
      typeof run === "object" &&
      !Array.isArray(run) &&
      (run as Dict).class === "GalaxyWorkflow"
    ) {
      _walkInline(run as Dict, out);
    }
  }
}

/**
 * Wrap *getToolInfo* in an {@link InlineResolver}, idempotently. Returns the
 * input unchanged if it is already an `InlineResolver` (so existing caches are
 * preserved).
 */
export function ensureInlineResolver(getToolInfo: GetToolInfo): InlineResolver {
  if (getToolInfo instanceof InlineResolver) return getToolInfo;
  return new InlineResolver(getToolInfo);
}
