/**
 * Helper for `gxwf mermaid` / `gxwf cytoscapejs` `--annotate-connections`:
 * runs the connection validator against a workflow and returns the
 * `EdgeAnnotation` lookup the emitters consume.
 */

import {
  buildEdgeAnnotations,
  buildWorkflowGraph,
  validateConnectionGraph,
  type EdgeAnnotation,
} from "@galaxy-tool-util/connection-validation";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";

import { buildGetToolInfo } from "./connection-validation.js";

export interface ResolveEdgeAnnotationsOptions {
  cacheDir?: string;
}

export async function resolveEdgeAnnotations(
  data: Record<string, unknown>,
  opts: ResolveEdgeAnnotationsOptions = {},
): Promise<Map<string, EdgeAnnotation>> {
  const cache = makeNodeToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();

  const getToolInfo = await buildGetToolInfo(data, cache);
  const graph = buildWorkflowGraph(data, getToolInfo);
  const [report] = validateConnectionGraph(graph);
  return buildEdgeAnnotations(report);
}
