import type { ParsedTool } from "@galaxy-tool-util/schema";

import type { GetToolInfo } from "./get-tool-info.js";

export interface ToolRef {
  toolId: string;
  toolVersion: string | null;
}

export type AsyncToolFetcher = (
  toolId: string,
  toolVersion: string | null,
) => Promise<ParsedTool | null>;

export interface BuildGetToolInfoOptions {
  /** Maximum in-flight fetches. Default 1 (serial) to match the CLI's prior behavior. */
  concurrency?: number;
  /** Called when a ref resolves to null or the fetcher rejects. */
  onMiss?: (ref: ToolRef, reason: unknown) => void;
  /** Called after each ref settles (resolved or missed). */
  onProgress?: (resolved: number, total: number) => void;
}

/** Walk a workflow dict (steps + nested subworkflows + nested `run`) and dedupe tool refs. */
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
      const key = lookupKey(toolId, toolVersion);
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

/**
 * Preload every tool referenced by `data` via `fetcher` and return a sync
 * `GetToolInfo` backed by the resulting Map. Misses are reported, not thrown —
 * the validator runs against whatever resolved.
 */
export async function buildGetToolInfo(
  data: Record<string, unknown>,
  fetcher: AsyncToolFetcher,
  opts: BuildGetToolInfoOptions = {},
): Promise<GetToolInfo> {
  const refs = collectToolRefs(data);
  const lookup = new Map<string, ParsedTool>();
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  let resolved = 0;

  const handleOne = async (ref: ToolRef): Promise<void> => {
    try {
      const tool = await fetcher(ref.toolId, ref.toolVersion);
      if (tool === null) {
        opts.onMiss?.(ref, "not_found");
      } else {
        lookup.set(lookupKey(ref.toolId, ref.toolVersion), tool);
      }
    } catch (e) {
      opts.onMiss?.(ref, e);
    } finally {
      resolved += 1;
      opts.onProgress?.(resolved, refs.length);
    }
  };

  if (concurrency === 1) {
    for (const ref of refs) {
      await handleOne(ref);
    }
  } else {
    let cursor = 0;
    const workers: Promise<void>[] = [];
    const next = async (): Promise<void> => {
      while (cursor < refs.length) {
        const i = cursor++;
        await handleOne(refs[i]!);
      }
    };
    for (let i = 0; i < Math.min(concurrency, refs.length); i++) {
      workers.push(next());
    }
    await Promise.all(workers);
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
