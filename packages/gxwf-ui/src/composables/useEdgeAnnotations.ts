import { ref } from "vue";
import type { EdgeAnnotation } from "@galaxy-tool-util/schema";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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
      const body = (await res.json()) as Record<string, EdgeAnnotation>;
      annotations.value = new Map(Object.entries(body));
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
