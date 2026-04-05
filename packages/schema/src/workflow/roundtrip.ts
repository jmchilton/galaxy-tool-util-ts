/**
 * Native → Format2 → Native roundtrip validation for stateful conversion.
 *
 * Uses `toFormat2Stateful` + `toNativeStateful` to round-trip a native
 * workflow, then diffs per-step `tool_state` with a classification pass
 * that marks type-coercion and connection/runtime artifacts as benign.
 *
 * Mirrors Python's `galaxy/tool_util/workflow_state/roundtrip.py` at a
 * minimal level — the goal is detecting *real* state corruption while
 * tolerating known stateful-conversion normalizations.
 */
import type { NormalizedNativeStep, NormalizedNativeWorkflow } from "./normalized/native.js";
import { ensureNative } from "./normalized/ensure.js";
import { toFormat2Stateful } from "./normalized/toFormat2Stateful.js";
import { toNativeStateful } from "./normalized/toNativeStateful.js";
import type { StepConversionStatus, ToolInputsResolver } from "./normalized/stateful-runner.js";
import type { StatefulExportResult } from "./normalized/toFormat2Stateful.js";
import { isConnectedValue, isRuntimeValue } from "./runtime-markers.js";
import { STALE_KEYS as SKIP_KEYS, isRuntimeLeakKey } from "./stale-keys.js";
import { stripStaleKeysToolAware } from "./clean.js";

// --- Types ---

export type RoundtripFailureClass =
  | "conversion_error"
  | "reimport_error"
  | "roundtrip_mismatch"
  /** Subworkflow ref was an external URL/TRS string — inline steps not available for diff. */
  | "subworkflow_external_ref";

export type DiffSeverity = "error" | "benign";

export type BenignArtifactKind =
  | "type_coercion"
  | "multi_select_normalized"
  | "all_null_section_omitted"
  | "empty_container_omitted"
  | "connection_only_section_omitted"
  | "bookkeeping_stripped"
  /**
   * Runtime-leak key (`__workflow_invocation_uuid__` or `*|__identifier__`)
   * dropped or appeared during roundtrip. Walker drops these silently during
   * stateful conversion; mirrors Galaxy's `RUNTIME_LEAK` classification.
   */
  | "runtime_leak_stripped";

export interface StepDiff {
  path: string;
  severity: DiffSeverity;
  kind?: BenignArtifactKind;
  message: string;
}

export interface StepRoundtripResult {
  stepId: string;
  toolId?: string;
  success: boolean;
  failureClass?: RoundtripFailureClass;
  error?: string;
  diffs: StepDiff[];
  /**
   * Nesting depth inside subworkflows. 0 = top-level, 1 = inside one
   * subworkflow, etc. Used by CLI reporters to indent nested results.
   * `stepId` is prefixed with parent ids using `.` (e.g. `3.1.0`).
   */
  depth: number;
}

export interface RoundtripResult {
  workflowName?: string;
  stepResults: StepRoundtripResult[];
  /** Per-step forward (native→format2) status from stateful conversion. */
  forwardSteps: StepConversionStatus[];
  /** Per-step reverse (format2→native) status from stateful conversion. */
  reverseSteps: StepConversionStatus[];
  /** No error-severity diffs and no step failures (benign diffs allowed). */
  success: boolean;
  /** No diffs at all (clean roundtrip). */
  clean: boolean;
}

// --- Bookkeeping / internal helpers ---

/** Compare two scalar values with format2↔native type-equivalence. */
function scalarsEquivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Nullish equivalence: null, undefined, and the string "null" all
  // represent "no value" in serialized workflow state. JSON has no
  // undefined, so a JS undefined reaching the differ means a key was
  // present-but-unset or missing entirely — equivalent to an explicit
  // null on the other side. Matches Python roundtrip.py's
  // `orig_val in (None, "null")` treatment.
  const isNullish = (v: unknown): boolean => v === null || v === undefined || v === "null";
  if (isNullish(a) && isNullish(b)) return true;
  if (a == null || b == null) return false;

  // Booleans ↔ "true"/"false"/"yes"/"no"
  const asBool = (v: unknown): boolean | undefined => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.toLowerCase();
      if (s === "true" || s === "yes") return true;
      if (s === "false" || s === "no") return false;
    }
    return undefined;
  };
  const ab = asBool(a);
  const bb = asBool(b);
  if (ab !== undefined && bb !== undefined) return ab === bb;

  // Numbers ↔ strings
  const asNum = (v: unknown): number | undefined => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };
  const an = asNum(a);
  const bn = asNum(b);
  if (an !== undefined && bn !== undefined) return an === bn;

  return false;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * All leaf values are null / "null". Format2 export drops these sections,
 * so their absence in the reimported state is benign.
 */
function isAllNullDict(v: unknown): boolean {
  if (v === null || v === "null") return true;
  if (Array.isArray(v)) return v.every(isAllNullDict);
  if (isPlainObject(v)) {
    for (const [k, val] of Object.entries(v)) {
      if (SKIP_KEYS.has(k)) continue;
      if (!isAllNullDict(val)) return false;
    }
    return true;
  }
  return false;
}

/**
 * Empty-repeat placeholder: empty arrays + null leaves. Requires at least
 * one empty list to be present, matching Python's `_is_empty_container_dict`
 * in `roundtrip.py` — otherwise a plain `{}` would be classified as this
 * kind when `all_null_section_omitted` is more accurate.
 */
function isEmptyContainerDict(v: unknown): boolean {
  let sawEmptyList = false;
  const walk = (x: unknown): boolean => {
    if (x === null) return true;
    if (Array.isArray(x)) {
      if (x.length === 0) {
        sawEmptyList = true;
        return true;
      }
      return x.every(walk);
    }
    if (isPlainObject(x)) {
      for (const [k, val] of Object.entries(x)) {
        if (SKIP_KEYS.has(k)) continue;
        if (!walk(val)) return false;
      }
      return true;
    }
    return false;
  };
  const ok = walk(v);
  return ok && sawEmptyList;
}

/** Contains only connection/runtime markers (moved to `in` block). */
function isConnectionOnlyDict(v: unknown): boolean {
  if (v == null) return true;
  if (isConnectedValue(v) || isRuntimeValue(v)) return true;
  if (Array.isArray(v)) return v.every(isConnectionOnlyDict);
  if (isPlainObject(v)) {
    let sawMarker = false;
    for (const [k, val] of Object.entries(v)) {
      if (SKIP_KEYS.has(k)) continue;
      if (val == null) continue;
      if (!isConnectionOnlyDict(val)) return false;
      sawMarker = true;
    }
    return sawMarker;
  }
  return false;
}

function classifyMissing(value: unknown): BenignArtifactKind | undefined {
  if (value === null || value === undefined || value === "null") {
    return "all_null_section_omitted";
  }
  if (isConnectedValue(value) || isRuntimeValue(value)) {
    return "connection_only_section_omitted";
  }
  if (isConnectionOnlyDict(value)) return "connection_only_section_omitted";
  if (isAllNullDict(value)) return "all_null_section_omitted";
  if (isEmptyContainerDict(value)) return "empty_container_omitted";
  return undefined;
}

/**
 * Multi-select equivalence: `"a,b"`, `["a","b"]`, and a bare scalar
 * compared against a 1-element list are all considered equivalent.
 */
function multiSelectEquivalent(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v.map((x) => String(x));
    if (typeof v === "string") return v.split(",").map((s) => s.trim());
    if (typeof v === "number" || typeof v === "boolean") return [String(v)];
    return undefined;
  };
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na.length !== nb.length) return false;
  for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) return false;
  return true;
}

// --- Recursive diff ---

/**
 * Recursive lockstep diff of two `tool_state` trees. Intentionally does
 * not use `walker.ts` — that module is a single-tree leaf-callback walker
 * keyed by parameter model, whereas this traverses two plain dicts in
 * parallel without a tool-inputs context. Also intentionally does NOT
 * JSON-decode string leaves (cf. Python's `_try_json_decode`): this port
 * treats containers as proper dicts/lists end-to-end, matching the
 * walker's "no legacy decode" principle.
 */
function compareTree(orig: unknown, after: unknown, path: string, diffs: StepDiff[]): void {
  // Exact equivalence
  if (scalarsEquivalent(orig, after)) return;

  // Multi-select normalization: only when exactly one side is an array
  // (scalar ↔ list, comma-string ↔ list). Two arrays fall through to the
  // element-wise recursion below so identical arrays don't get flagged.
  if (Array.isArray(orig) !== Array.isArray(after) && multiSelectEquivalent(orig, after)) {
    diffs.push({
      path,
      severity: "benign",
      kind: "multi_select_normalized",
      message: `multi-select representation differs: ${JSON.stringify(orig)} vs ${JSON.stringify(after)}`,
    });
    return;
  }

  // Scalar mismatch after coercion rules → error
  if (
    !isPlainObject(orig) &&
    !isPlainObject(after) &&
    !Array.isArray(orig) &&
    !Array.isArray(after)
  ) {
    diffs.push({
      path,
      severity: "error",
      message: `value changed: ${JSON.stringify(orig)} → ${JSON.stringify(after)}`,
    });
    return;
  }

  // Arrays: compare lengths, recurse element-wise
  if (Array.isArray(orig) && Array.isArray(after)) {
    if (orig.length !== after.length) {
      diffs.push({
        path,
        severity: "error",
        message: `array length ${orig.length} → ${after.length}`,
      });
      return;
    }
    for (let i = 0; i < orig.length; i++) {
      compareTree(orig[i], after[i], `${path}[${i}]`, diffs);
    }
    return;
  }

  // Dict mismatch with non-dict other side
  if (!isPlainObject(orig) || !isPlainObject(after)) {
    // One side might be an omitted section represented by null/absent on the other
    const benign = classifyMissing(orig) ?? classifyMissing(after);
    if (benign) {
      diffs.push({
        path,
        severity: "benign",
        kind: benign,
        message: `type change tolerated as ${benign}`,
      });
      return;
    }
    diffs.push({
      path,
      severity: "error",
      message: `structural mismatch: ${typeof orig} vs ${typeof after}`,
    });
    return;
  }

  // Both plain objects → key-wise compare
  const keys = new Set([...Object.keys(orig), ...Object.keys(after)]);
  for (const key of keys) {
    if (SKIP_KEYS.has(key)) {
      // Presence on either side is benign bookkeeping (only report if orig had
      // it — avoids noise from reimported state never having it)
      if (key in orig && !(key in after)) {
        diffs.push({
          path: `${path}.${key}`,
          severity: "benign",
          kind: "bookkeeping_stripped",
          message: `stale key ${key} stripped`,
        });
      }
      continue;
    }
    if (isRuntimeLeakKey(key)) {
      // Walker drops runtime-leak keys (`__workflow_invocation_uuid__`,
      // `*|__identifier__`) during stateful conversion — neither side of the
      // roundtrip keeps them. Mirrors Galaxy's `RUNTIME_LEAK` classification
      // in `stale_keys.py`; `for_export` allows them but they don't survive
      // format2 round-trip. Treat any drop/appearance as benign.
      const hasOrig = key in orig;
      const hasAfter = key in after;
      if (hasOrig !== hasAfter) {
        diffs.push({
          path: path ? `${path}.${key}` : key,
          severity: "benign",
          kind: "runtime_leak_stripped",
          message: `runtime leak ${key} ${hasOrig ? "stripped" : "appeared"}`,
        });
      }
      continue;
    }
    const subPath = path ? `${path}.${key}` : key;
    const hasOrig = key in orig;
    const hasAfter = key in after;
    if (hasOrig && hasAfter) {
      compareTree(orig[key], after[key], subPath, diffs);
      continue;
    }
    // Missing on one side — classify
    const presentValue = hasOrig ? orig[key] : after[key];
    // Null/"null" leaves: matches Python roundtrip.py where
    // `orig_val in (None, "null", [])` short-circuits with no diff. This
    // keeps `clean=true` aligned with the Python reference's "ok" status.
    if (
      presentValue === null ||
      presentValue === undefined ||
      presentValue === "null" ||
      (Array.isArray(presentValue) && presentValue.length === 0)
    ) {
      continue;
    }
    const benign = classifyMissing(presentValue);
    if (benign) {
      diffs.push({
        path: subPath,
        severity: "benign",
        kind: benign,
        message: `key ${hasOrig ? "dropped" : "added"} (${benign})`,
      });
    } else {
      diffs.push({
        path: subPath,
        severity: "error",
        message: `key ${hasOrig ? "missing after roundtrip" : "appeared after roundtrip"}`,
      });
    }
  }
}

// --- Step collection ---

interface CollectedStep {
  step: NormalizedNativeStep;
  depth: number;
}

interface CollectedSubworkflow {
  stepId: string;
  depth: number;
  /** Non-null when the subworkflow is inline; null for external URL/TRS refs. */
  workflow: NormalizedNativeWorkflow | null;
}

/**
 * Walk a native workflow collecting tool steps and subworkflow references.
 *
 * Tool step ids are prefixed with their parent chain separated by `.` so
 * nested ids don't collide with top-level ids (e.g. `3.0` = step 0 inside
 * the subworkflow at top-level id 3). Depth tracks nesting for reporters.
 * External (URL/TRS) subworkflow refs are recorded but not recursed into.
 */
function collectSteps(
  wf: NormalizedNativeWorkflow,
  prefix: string = "",
  depth: number = 0,
): { tools: Map<string, CollectedStep>; subworkflows: CollectedSubworkflow[] } {
  const tools = new Map<string, CollectedStep>();
  const subworkflows: CollectedSubworkflow[] = [];
  for (const [key, step] of Object.entries(wf.steps)) {
    const localId = String(step.id ?? key);
    const fullId = prefix ? `${prefix}.${localId}` : localId;
    if (step.type === "tool") {
      tools.set(fullId, { step, depth });
    } else if (step.type === "subworkflow") {
      subworkflows.push({ stepId: fullId, depth, workflow: step.subworkflow ?? null });
      if (step.subworkflow != null) {
        const nested = collectSteps(step.subworkflow, fullId, depth + 1);
        for (const [k, v] of nested.tools) tools.set(k, v);
        subworkflows.push(...nested.subworkflows);
      }
    }
  }
  return { tools, subworkflows };
}

// --- Public entry point ---

/**
 * Roundtrip a native workflow through format2 and back, diffing each
 * tool step's `tool_state`. Benign diffs (type coercion, connection
 * moves, stale-key stripping) are reported but don't count as failures.
 *
 * Returns `success=true` iff no error-severity diffs and no conversion
 * failures. `clean=true` iff there are zero diffs of any severity.
 */
export function roundtripValidate(
  nativeRaw: unknown,
  toolInputsResolver: ToolInputsResolver,
): RoundtripResult {
  const original = ensureNative(nativeRaw);
  const { tools: originalSteps, subworkflows: originalSubworkflows } = collectSteps(original);

  // Pre-clean: strip undeclared keys from each tool step's `tool_state`
  // using the tool definition. Mirrors Galaxy's
  // `roundtrip_validate(clean_stale=True)` default, which runs
  // `clean_stale_state` before diffing so runtime leaks, stale-branch
  // params, and tool-upgrade residue are removed from the original.
  // Without this pass, the diff flags asymmetries between the raw
  // original and the walker-produced reimport as errors.
  for (const entry of originalSteps.values()) {
    const step = entry.step;
    if (step.type !== "tool" || !step.tool_id) continue;
    const inputs = toolInputsResolver(step.tool_id, step.tool_version ?? null);
    if (!inputs) continue;
    // Deep clone via JSON round-trip — tool_state is JSON-compatible by
    // design (parsed from a JSON string), and ES2022 lib doesn't include
    // structuredClone.
    const stateClone = JSON.parse(JSON.stringify(step.tool_state)) as Record<string, unknown>;
    const cleaned = stripStaleKeysToolAware(
      stateClone,
      inputs,
      (step.input_connections ?? {}) as Record<string, unknown>,
    );
    // Mutate the collected step's tool_state in place. `original` was
    // produced fresh by `ensureNative(nativeRaw)` so mutation is local.
    (step as { tool_state: Record<string, unknown> }).tool_state = cleaned;
  }

  let forwardSteps: StepConversionStatus[] = [];
  let reverseSteps: StepConversionStatus[] = [];
  let reimported: NormalizedNativeWorkflow | undefined;
  const stepResults: StepRoundtripResult[] = [];

  // Forward: native → format2
  let forward: StatefulExportResult;
  try {
    forward = toFormat2Stateful(nativeRaw, toolInputsResolver);
  } catch (err) {
    // Total failure — attribute to all tool steps (including nested)
    const error = err instanceof Error ? err.message : String(err);
    for (const [stepId, { step, depth }] of originalSteps) {
      stepResults.push({
        stepId,
        toolId: step.tool_id ?? undefined,
        success: false,
        failureClass: "conversion_error",
        error,
        diffs: [],
        depth,
      });
    }
    return {
      stepResults,
      forwardSteps,
      reverseSteps,
      success: false,
      clean: false,
    };
  }
  forwardSteps = forward.steps;

  // Reverse: format2 → native
  try {
    const reverse = toNativeStateful(forward.workflow, toolInputsResolver);
    reverseSteps = reverse.steps;
    reimported = reverse.workflow;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    for (const [stepId, { step, depth }] of originalSteps) {
      stepResults.push({
        stepId,
        toolId: step.tool_id ?? undefined,
        success: false,
        failureClass: "reimport_error",
        error,
        diffs: [],
        depth,
      });
    }
    return {
      stepResults,
      forwardSteps,
      reverseSteps,
      success: false,
      clean: false,
    };
  }

  const { tools: reimportedSteps } = collectSteps(reimported);

  // Per-step comparison (top-level + recursively-collected nested tools)
  for (const [stepId, { step: origStep, depth }] of originalSteps) {
    const afterEntry = reimportedSteps.get(stepId);
    if (!afterEntry) {
      stepResults.push({
        stepId,
        toolId: origStep.tool_id ?? undefined,
        success: false,
        failureClass: "roundtrip_mismatch",
        error: `step ${stepId} missing after roundtrip`,
        diffs: [],
        depth,
      });
      continue;
    }
    // Per-step forward failure → propagate. Note: forwardSteps from
    // `makeStepConversionRunner` uses unprefixed step ids. Nested steps
    // with the same local id as a top-level step can collide; we match
    // by suffix (localId) and tool_id as a best-effort disambiguation.
    const localId = stepId.includes(".") ? stepId.slice(stepId.lastIndexOf(".") + 1) : stepId;
    const forwardFailure = forwardSteps.find(
      (s) => s.stepId === localId && !s.converted && s.toolId === (origStep.tool_id ?? undefined),
    );
    if (forwardFailure) {
      stepResults.push({
        stepId,
        toolId: origStep.tool_id ?? undefined,
        success: false,
        failureClass: "conversion_error",
        error: forwardFailure.error,
        diffs: [],
        depth,
      });
      continue;
    }
    const diffs: StepDiff[] = [];
    compareTree(origStep.tool_state, afterEntry.step.tool_state, "", diffs);
    const hasError = diffs.some((d) => d.severity === "error");
    stepResults.push({
      stepId,
      toolId: origStep.tool_id ?? undefined,
      success: !hasError,
      failureClass: hasError ? "roundtrip_mismatch" : undefined,
      diffs,
      depth,
    });
  }

  // External (URL/TRS) subworkflow refs: surface an informational entry
  // so callers can see the step exists and was deliberately skipped.
  // Inline subworkflows are handled by the recursive collection above.
  for (const sw of originalSubworkflows) {
    if (sw.workflow != null) continue;
    stepResults.push({
      stepId: sw.stepId,
      toolId: undefined,
      success: true,
      failureClass: "subworkflow_external_ref",
      error: "external subworkflow reference (URL/TRS) — inline steps not available for diff",
      diffs: [],
      depth: sw.depth,
    });
  }

  // Only tool-step results contribute to overall verdicts; external-ref
  // entries are informational.
  const toolResults = stepResults.filter((s) => s.failureClass !== "subworkflow_external_ref");
  const anyError = toolResults.some((s) => !s.success);
  const anyDiff = toolResults.some((s) => s.diffs.length > 0);
  return {
    workflowName: (original.name ?? undefined) || undefined,
    stepResults,
    forwardSteps,
    reverseSteps,
    success: !anyError,
    clean: !anyDiff && !anyError,
  };
}
