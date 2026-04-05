/**
 * Helper for stateful workflow conversion: expand a workflow, walk every
 * step (including subworkflows), and preload tool parameter definitions
 * from a `ToolCache` into a synchronous `ToolInputsResolver` suitable for
 * `toFormat2Stateful` / `toNativeStateful`.
 *
 * Using `expandedNative` / `expandedFormat2` ensures externally-referenced
 * subworkflows (@import, URL, TRS) contribute their tools — not just
 * inline subworkflows (which is all `unique_tools` would cover).
 *
 * Keys inputs by `${tool_id}\0${tool_version ?? ""}` so multi-version
 * workflows don't collide. Matches gxformat2's `ConversionOptions`
 * callback-shaped design: callers pass the resolver, not the map.
 */
import type { ToolCache } from "@galaxy-tool-util/core";
import {
  expandedFormat2,
  expandedNative,
  type ExpansionOptions,
  type NormalizedFormat2Step,
  type NormalizedFormat2Workflow,
  type NormalizedNativeStep,
  type NormalizedNativeWorkflow,
  type ToolInputsResolver,
  type ToolParameterBundleModel,
  type WorkflowFormat,
} from "@galaxy-tool-util/schema";
import { isResolveError, loadCachedTool } from "./resolve-tool.js";

type ToolInputs = ToolParameterBundleModel["parameters"];

export interface ToolLoadStatus {
  toolId: string;
  toolVersion: string | null;
  loaded: boolean;
  error?: string;
}

export interface LoadedToolInputs {
  resolver: ToolInputsResolver;
  status: ToolLoadStatus[];
}

function toolKey(toolId: string, version: string | null): string {
  return `${toolId}\0${version ?? ""}`;
}

/**
 * Expand the workflow, walk every step, and preload tool inputs from the
 * cache. Returns a sync resolver for `toFormat2Stateful` / `toNativeStateful`
 * plus a per-tool load status list.
 */
export async function loadToolInputsForWorkflow(
  data: Record<string, unknown>,
  format: WorkflowFormat,
  cache: ToolCache,
  expansionOpts?: ExpansionOptions,
): Promise<LoadedToolInputs> {
  const refs =
    format === "native"
      ? collectNativeToolRefs(await expandedNative(data, expansionOpts))
      : collectFormat2ToolRefs(await expandedFormat2(data, expansionOpts));

  const loaded: Map<string, ToolInputs> = new Map();
  const status: ToolLoadStatus[] = [];

  for (const [toolId, version] of refs) {
    const key = toolKey(toolId, version);
    if (loaded.has(key)) continue;
    const resolved = await loadCachedTool(cache, toolId, version);
    if (isResolveError(resolved)) {
      const reason =
        resolved.kind === "no_version" ? `no version for ${toolId}` : `${toolId} not in cache`;
      status.push({ toolId, toolVersion: version, loaded: false, error: reason });
      continue;
    }
    loaded.set(key, resolved.tool.inputs as ToolInputs);
    status.push({ toolId, toolVersion: version, loaded: true });
  }

  const resolver: ToolInputsResolver = (toolId, version) => loaded.get(toolKey(toolId, version));
  return { resolver, status };
}

// --- Step walkers over expanded workflows ---

function collectNativeToolRefs(wf: NormalizedNativeWorkflow): Array<[string, string | null]> {
  const seen = new Set<string>();
  const refs: Array<[string, string | null]> = [];
  const walk = (steps: NormalizedNativeWorkflow["steps"]): void => {
    for (const step of Object.values(steps) as NormalizedNativeStep[]) {
      if (step.tool_id != null) {
        const key = toolKey(step.tool_id, step.tool_version ?? null);
        if (!seen.has(key)) {
          seen.add(key);
          refs.push([step.tool_id, step.tool_version ?? null]);
        }
      }
      if (step.subworkflow) walk(step.subworkflow.steps);
    }
  };
  walk(wf.steps);
  return refs;
}

function collectFormat2ToolRefs(wf: NormalizedFormat2Workflow): Array<[string, string | null]> {
  const seen = new Set<string>();
  const refs: Array<[string, string | null]> = [];
  const walk = (steps: readonly NormalizedFormat2Step[]): void => {
    for (const step of steps) {
      if (step.tool_id != null) {
        const key = toolKey(step.tool_id, step.tool_version ?? null);
        if (!seen.has(key)) {
          seen.add(key);
          refs.push([step.tool_id, step.tool_version ?? null]);
        }
      }
      if (step.run && typeof step.run === "object") {
        walk((step.run as NormalizedFormat2Workflow).steps);
      }
    }
  };
  walk(wf.steps);
  return refs;
}
