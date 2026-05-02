import { ref } from "vue";

import {
  buildEdgeAnnotations,
  buildGetToolInfo,
  buildWorkflowGraph,
  validateConnectionGraph,
  type EdgeAnnotation,
  type ToolRef,
} from "@galaxy-tool-util/connection-validation";

import { useContents } from "./useContents";
import { useToolInfoService } from "./useToolInfoService";

export interface ClientEdgeAnnotationMiss {
  toolId: string;
  toolVersion: string | null;
  reason: string;
}

export interface ClientEdgeAnnotationProgress {
  resolved: number;
  total: number;
}

const DEFAULT_CONCURRENCY = 6;

function reasonString(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return String(reason);
}

/**
 * Browser-side peer of `useEdgeAnnotations`. Resolves every tool referenced by
 * a workflow through `useToolInfoService` (IndexedDB-backed `ToolCache` →
 * ToolShed / proxy fall-back), then runs the connection validator + edge-
 * annotation builder locally. Output is shape-compatible with the server-side
 * composable so renderers can swap with a one-line import change.
 *
 * Tools that fail to resolve land in `misses` — annotations for edges into
 * those tools simply don't appear (same fidelity loss as if the validator
 * never had specs, no thrown error). `progress` ticks once per ref so the
 * toolbar can show "n/m resolved" during a cold start.
 */
export function useClientEdgeAnnotations() {
  const annotations = ref<Map<string, EdgeAnnotation> | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const misses = ref<ClientEdgeAnnotationMiss[]>([]);
  const progress = ref<ClientEdgeAnnotationProgress | null>(null);

  async function build(path: string): Promise<void> {
    loading.value = true;
    error.value = null;
    misses.value = [];
    progress.value = null;
    try {
      const data = (await useContents().loadWorkflowContent(path)) as Record<string, unknown>;
      const service = useToolInfoService();
      const collected: ClientEdgeAnnotationMiss[] = [];

      const getToolInfo = await buildGetToolInfo(
        data,
        async (id, version) => service.getToolInfo(id, version),
        {
          concurrency: DEFAULT_CONCURRENCY,
          onMiss: (ref: ToolRef, reason: unknown) => {
            collected.push({
              toolId: ref.toolId,
              toolVersion: ref.toolVersion,
              reason: reasonString(reason),
            });
          },
          onProgress: (resolved, total) => {
            progress.value = { resolved, total };
          },
        },
      );

      const graph = buildWorkflowGraph(data, getToolInfo);
      const [report] = validateConnectionGraph(graph);
      annotations.value = buildEdgeAnnotations(report);
      misses.value = collected;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      annotations.value = null;
    } finally {
      loading.value = false;
    }
  }

  function clear(): void {
    annotations.value = null;
    error.value = null;
    misses.value = [];
    progress.value = null;
  }

  return { annotations, loading, error, misses, progress, build, clear };
}
