import { ref } from "vue";
import { parse as parseYaml } from "yaml";
import { workflowToMermaid } from "@galaxy-tool-util/schema";
import { useContents } from "./useContents";

export function useMermaid() {
  const diagram = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const { fetchPath } = useContents();

  async function build(path: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const model = await fetchPath(path);
      if (!model || model.type !== "file" || typeof model.content !== "string") {
        throw new Error(`No file content for ${path}`);
      }
      const raw = model.content;
      const parsed = path.endsWith(".ga")
        ? (JSON.parse(raw) as unknown)
        : (parseYaml(raw) as unknown);
      diagram.value = workflowToMermaid(parsed);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      diagram.value = null;
    } finally {
      loading.value = false;
    }
  }

  return { diagram, loading, error, build };
}
