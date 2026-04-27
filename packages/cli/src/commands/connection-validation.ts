/**
 * CLI integration for connection validation.
 *
 * Walks a workflow dict to collect every tool reference (recursing into
 * subworkflows), preloads each tool from the cache, and runs
 * `validateConnectionsReport`. The connection validator wants a sync
 * `GetToolInfo` lookup, so async cache fetches happen up front.
 */

import {
  validateConnectionsReport,
  type GetToolInfo,
} from "@galaxy-tool-util/connection-validation";
import type { ToolCache } from "@galaxy-tool-util/core";
import type { ConnectionValidationReport, ParsedTool } from "@galaxy-tool-util/schema";

import { isResolveError, loadCachedTool } from "./resolve-tool.js";

export async function buildConnectionReport(
  data: Record<string, unknown>,
  cache: ToolCache,
): Promise<ConnectionValidationReport> {
  const getToolInfo = await buildGetToolInfo(data, cache);
  return validateConnectionsReport(data, getToolInfo);
}

export async function buildGetToolInfo(
  data: Record<string, unknown>,
  cache: ToolCache,
): Promise<GetToolInfo> {
  const refs = collectToolRefs(data);
  const lookup = new Map<string, ParsedTool>();
  for (const ref of refs) {
    const resolved = await loadCachedTool(cache, ref.toolId, ref.toolVersion);
    if (!isResolveError(resolved)) {
      lookup.set(lookupKey(ref.toolId, ref.toolVersion), resolved.tool);
    }
  }
  return {
    getToolInfo: (id, version) => {
      const versioned = lookup.get(lookupKey(id, version ?? null));
      if (versioned) return versioned;
      // Graph builder usually passes tool_version, but callers may omit it.
      return lookup.get(lookupKey(id, null)) ?? firstByToolId(lookup, id);
    },
  };
}

export interface ToolRef {
  toolId: string;
  toolVersion: string | null;
}

function lookupKey(toolId: string, toolVersion: string | null): string {
  return `${toolId}@${toolVersion ?? ""}`;
}

function firstByToolId(lookup: Map<string, ParsedTool>, toolId: string): ParsedTool | undefined {
  const prefix = `${toolId}@`;
  for (const [k, v] of lookup) {
    if (k.startsWith(prefix)) return v;
  }
  return undefined;
}

export function collectToolRefs(data: Record<string, unknown>): ToolRef[] {
  const out: ToolRef[] = [];
  const seen = new Set<string>();
  _walk(data, out, seen);
  return out;
}

function _walk(node: Record<string, unknown>, out: ToolRef[], seen: Set<string>): void {
  const steps = node.steps;
  if (steps == null || typeof steps !== "object") return;

  const iter: Iterable<unknown> = Array.isArray(steps)
    ? (steps as unknown[])
    : Object.values(steps as Record<string, unknown>);

  for (const stepRaw of iter) {
    if (stepRaw == null || typeof stepRaw !== "object") continue;
    const step = stepRaw as Record<string, unknown>;
    const toolId = (step.tool_id as string | null | undefined) ?? null;
    const toolVersion = (step.tool_version as string | null | undefined) ?? null;
    if (toolId) {
      const key = `${toolId}@${toolVersion ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ toolId, toolVersion });
      }
    }
    const subworkflow = step.subworkflow;
    if (subworkflow && typeof subworkflow === "object") {
      _walk(subworkflow as Record<string, unknown>, out, seen);
    }
    const run = step.run;
    if (run && typeof run === "object" && !Array.isArray(run)) {
      _walk(run as Record<string, unknown>, out, seen);
    }
  }
}
