import { ref } from "vue";
import type { ParsedTool } from "@galaxy-tool-util/schema";
import type { EdgeAnnotation } from "@galaxy-tool-util/schema";

import { useToolInfoService } from "./useToolInfoService";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

interface ToolSpecPayload {
  tool_id: string;
  tool_version: string;
  parsed: ParsedTool;
}

interface EnvelopeResponse {
  annotations: Record<string, EdgeAnnotation>;
  tool_specs?: Record<string, ToolSpecPayload>;
}

function isEnvelope(body: unknown): body is EnvelopeResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    "annotations" in body &&
    typeof (body as Record<string, unknown>).annotations === "object"
  );
}

export function useEdgeAnnotations() {
  const annotations = ref<Map<string, EdgeAnnotation> | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function build(path: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const url = `${BASE_URL}/workflows/${encodeURIComponent(path)}/edge-annotations`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        throw new Error(`Edge annotations request failed: ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as unknown;

      let annMap: Record<string, EdgeAnnotation>;
      let specs: Record<string, ToolSpecPayload> | undefined;
      if (isEnvelope(body)) {
        annMap = body.annotations;
        specs = body.tool_specs;
      } else {
        // Legacy gxwf-web (pre-hybrid) returned a bare `Record<edgeKey, EdgeAnnotation>`.
        annMap = body as Record<string, EdgeAnnotation>;
      }
      annotations.value = new Map(Object.entries(annMap));

      if (specs) {
        // Write-through into the IndexedDB cache so subsequent loads (whether
        // server-routed or client-side via `useClientEdgeAnnotations`) hit a warm
        // cache. Failures are logged but never block annotations from rendering.
        const service = useToolInfoService();
        await Promise.all(
          Object.values(specs).map(async (spec) => {
            try {
              await service.addTool(spec.tool_id, spec.tool_version, spec.parsed, "gxwf-web", url);
            } catch (e) {
              console.debug(
                `[useEdgeAnnotations] tool_specs write-through failed for ${spec.tool_id}@${spec.tool_version}:`,
                e,
              );
            }
          }),
        );
      }
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
  }

  return { annotations, loading, error, build, clear };
}
