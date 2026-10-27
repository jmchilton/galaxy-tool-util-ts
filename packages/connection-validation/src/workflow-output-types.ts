import { validateConnectionGraph } from "./connection-validator.js";
import { isAnyDesc, isNullDesc } from "./collection-type-functions.js";
import type { GetToolInfo } from "./get-tool-info.js";
import { buildWorkflowGraph } from "./graph-builder.js";

/**
 * Resolved shape of each labelled workflow output: its collection type, or
 * `null` for a dataset. Outputs whose shape is unknown (unresolved tools,
 * skipped connections) are omitted.
 */
export function resolveWorkflowOutputCollectionTypes(
  workflow: unknown,
  getToolInfo: GetToolInfo,
): Map<string, string | null> {
  const graph = buildWorkflowGraph(workflow, getToolInfo);
  const [, resolved] = validateConnectionGraph(graph);
  const result = new Map<string, string | null>();
  for (const [label, [stepId, outputName]] of Object.entries(graph.outputMap ?? {})) {
    const desc = resolved[stepId]?.[outputName];
    if (!desc || isAnyDesc(desc)) continue;
    result.set(label, isNullDesc(desc) ? null : desc.collectionType);
  }
  return result;
}
