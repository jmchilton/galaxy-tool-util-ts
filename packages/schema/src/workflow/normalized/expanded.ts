/**
 * Expanded workflow models.
 *
 * Expansion resolves all external references (@import, URL, TRS, base64)
 * in step run/subworkflow fields. Supports async URL fetching via a
 * configurable resolver callback.
 *
 * Port of gxformat2/normalized/_conversion.py expanded_format2/expanded_native
 * and gxformat2/options.py (UrlResolverFn, default_url_resolver, ConversionOptions).
 */

import type { NormalizedFormat2Workflow, NormalizedFormat2Step } from "./format2.js";
import { normalizedFormat2 } from "./format2.js";
import type { NormalizedNativeWorkflow, NormalizedNativeStep } from "./native.js";
import { normalizedNative } from "./native.js";
import { toFormat2 } from "./toFormat2.js";
import { toNative } from "./toNative.js";

// --- Public types ---

// Expanded types are structurally identical to normalized — once expansion
// completes, step.run / step.subworkflow are guaranteed to be inline
// workflow objects (never unresolved strings).
export type ExpandedFormat2Workflow = NormalizedFormat2Workflow;
export type ExpandedFormat2Step = NormalizedFormat2Step;
export type ExpandedNativeWorkflow = NormalizedNativeWorkflow;
export type ExpandedNativeStep = NormalizedNativeStep;

/**
 * Async callback to resolve a reference string and return a parsed workflow dict.
 *
 * For URL references: fetches the URL and parses the response.
 * For file path references: reads the file and parses it.
 *
 * The resolver receives the raw reference string (URL or file path)
 * and must return a parsed workflow dict.
 */
export type RefResolver = (ref: string) => Promise<Record<string, unknown>>;

/**
 * Options controlling subworkflow expansion.
 */
export interface ExpansionOptions {
  /**
   * Resolver for external references. Receives a reference string
   * (URL, base64 URI, or file path) and must return a parsed workflow dict.
   *
   * Must handle both URL references (containing "://") and file path
   * references (bare paths from @import). If not provided, string run
   * values pass through unresolved.
   *
   * See @galaxy-tool-util/cli's createDefaultResolver() for a Node.js
   * implementation handling base64, TRS, HTTP, and file paths.
   */
  resolver?: RefResolver;
}

// --- Constants ---

export const MAX_EXPANSION_DEPTH = 10;

const TRS_URL_REGEX =
  /^https?:\/\/.+\/ga4gh\/trs\/v2\/tools\/.+\/versions\/[^/]+/;

// --- Helpers ---

/** Check if a URL matches the GA4GH TRS v2 tools/versions pattern. */
export function isTrsUrl(url: string): boolean {
  return TRS_URL_REGEX.test(url);
}

/** Check if a content_id is a URL that can be fetched. */
function _isResolvableUrl(contentId: string): boolean {
  return (
    contentId.startsWith("http://") ||
    contentId.startsWith("https://") ||
    contentId.startsWith("base64://")
  );
}

/** Detect if a raw dict is a native Galaxy workflow (vs Format2). */
function _isNativeWorkflow(raw: Record<string, unknown>): boolean {
  return raw.a_galaxy_workflow === "true";
}

/** Convert a fetched workflow dict to NormalizedFormat2, handling cross-format. */
function _ensureFormat2(resolved: Record<string, unknown>): NormalizedFormat2Workflow {
  if (_isNativeWorkflow(resolved)) {
    return toFormat2(resolved);
  }
  return normalizedFormat2(resolved);
}

/** Convert a fetched workflow dict to NormalizedNativeWorkflow, handling cross-format. */
function _ensureNative(resolved: Record<string, unknown>): NormalizedNativeWorkflow {
  if (_isNativeWorkflow(resolved)) {
    return normalizedNative(resolved);
  }
  return toNative(resolved);
}

// --- Expansion context (cycle detection + depth limiting) ---

class ExpansionContext {
  private _resolver: RefResolver;
  private _resolvingRefs: ReadonlySet<string>;

  constructor(resolver: RefResolver, resolvingRefs: ReadonlySet<string> = new Set()) {
    this._resolver = resolver;
    this._resolvingRefs = resolvingRefs;
  }

  async resolve(ref: string): Promise<Record<string, unknown>> {
    if (this._resolvingRefs.has(ref)) {
      throw new Error(`Circular subworkflow reference: ${ref}`);
    }
    if (this._resolvingRefs.size >= MAX_EXPANSION_DEPTH) {
      throw new Error(`Max expansion depth (${MAX_EXPANSION_DEPTH}) exceeded`);
    }
    return this._resolver(ref);
  }

  child(ref: string): ExpansionContext {
    const childRefs = new Set(this._resolvingRefs);
    childRefs.add(ref);
    return new ExpansionContext(this._resolver, childRefs);
  }
}

// --- Public entry points ---

/**
 * Normalize and expand a Format2 workflow.
 *
 * Resolves @import, URL, TRS URL, and base64 references in step `run`
 * fields. Uses `options.resolver` (or a no-op that leaves strings as-is)
 * for fetching external references.
 */
export async function expandedFormat2(
  raw: unknown,
  options?: ExpansionOptions,
): Promise<ExpandedFormat2Workflow> {
  const wf = normalizedFormat2(raw);
  if (!options?.resolver) {
    // No resolver provided — sync expansion only (inline subworkflows)
    return _expandFormat2Sync(wf);
  }
  const ctx = new ExpansionContext(options.resolver);
  return _expandFormat2(wf, ctx);
}

/**
 * Normalize and expand a native workflow.
 *
 * Resolves content_id URL references by fetching and converting them.
 * Uses `options.resolver` for fetching external references.
 */
export async function expandedNative(
  raw: unknown,
  options?: ExpansionOptions,
): Promise<ExpandedNativeWorkflow> {
  const wf = normalizedNative(raw);
  if (!options?.resolver) {
    // No resolver provided — sync expansion only (inline subworkflows)
    return _expandNativeSync(wf);
  }
  const ctx = new ExpansionContext(options.resolver);
  return _expandNative(wf, ctx);
}

// --- Sync expansion (no resolver — inline subworkflows only) ---

function _expandFormat2Sync(wf: NormalizedFormat2Workflow): ExpandedFormat2Workflow {
  const expandedSteps = wf.steps.map((step) => {
    if (step.run && typeof step.run === "object") {
      return { ...step, run: _expandFormat2Sync(step.run as NormalizedFormat2Workflow) };
    }
    return { ...step, run: step.run ?? null };
  });
  return { ...wf, steps: expandedSteps };
}

function _expandNativeSync(wf: NormalizedNativeWorkflow): ExpandedNativeWorkflow {
  const expandedSteps: Record<string, NormalizedNativeStep> = {};
  for (const [key, step] of Object.entries(wf.steps)) {
    if (step.subworkflow != null) {
      expandedSteps[key] = { ...step, subworkflow: _expandNativeSync(step.subworkflow) };
    } else {
      expandedSteps[key] = step;
    }
  }
  return { ...wf, steps: expandedSteps };
}

// --- Async expansion (with resolver) ---

async function _expandFormat2(
  wf: NormalizedFormat2Workflow,
  ctx: ExpansionContext,
): Promise<ExpandedFormat2Workflow> {
  const expandedSteps: NormalizedFormat2Step[] = [];

  for (const step of wf.steps) {
    let expandedRun: NormalizedFormat2Workflow | null = null;

    if (step.run && typeof step.run === "object") {
      // Already-inlined subworkflow — recurse
      expandedRun = await _expandFormat2(
        step.run as NormalizedFormat2Workflow,
        ctx,
      );
    } else if (typeof step.run === "string") {
      // External reference (URL, file path, base64)
      const resolved = await ctx.resolve(step.run);
      const childCtx = ctx.child(step.run);
      const normalized = _ensureFormat2(resolved);
      expandedRun = await _expandFormat2(normalized, childCtx);
    }

    expandedSteps.push({
      ...step,
      run: expandedRun,
    });
  }

  return { ...wf, steps: expandedSteps };
}

async function _expandNative(
  wf: NormalizedNativeWorkflow,
  ctx: ExpansionContext,
): Promise<ExpandedNativeWorkflow> {
  const expandedSteps: Record<string, NormalizedNativeStep> = {};

  for (const [key, step] of Object.entries(wf.steps)) {
    let expandedSub: NormalizedNativeWorkflow | null = null;

    if (step.subworkflow != null) {
      // Already-inlined subworkflow — recurse
      expandedSub = await _expandNative(step.subworkflow, ctx);
    } else if (step.content_id && _isResolvableUrl(step.content_id)) {
      // External URL content_id — fetch, convert to native, recurse
      const resolved = await ctx.resolve(step.content_id);
      const childCtx = ctx.child(step.content_id);
      const normalized = _ensureNative(resolved);
      expandedSub = await _expandNative(normalized, childCtx);
    }

    if (expandedSub != null) {
      // Replace content_id with inline subworkflow
      const { content_id: _dropped, ...rest } = step;
      expandedSteps[key] = { ...rest, subworkflow: expandedSub };
    } else {
      expandedSteps[key] = step;
    }
  }

  return { ...wf, steps: expandedSteps };
}
