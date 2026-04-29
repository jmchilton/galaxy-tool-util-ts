import { ref } from "vue";
import { workflowToMermaid, type EdgeAnnotation } from "@galaxy-tool-util/schema";
import { useContents } from "./useContents";

export interface UseMermaidBuildOptions {
  edgeAnnotations?: Map<string, EdgeAnnotation>;
}

export function useMermaid() {
  const diagram = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const { loadWorkflowContent } = useContents();

  async function build(path: string, opts: UseMermaidBuildOptions = {}): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const parsed = await loadWorkflowContent(path);
      diagram.value = workflowToMermaid(parsed, { edgeAnnotations: opts.edgeAnnotations });
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      diagram.value = null;
    } finally {
      loading.value = false;
    }
  }

  return { diagram, loading, error, build };
}
