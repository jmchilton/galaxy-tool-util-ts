import { ref } from "vue";
import {
  cytoscapeElements,
  type CytoscapeElements,
  type EdgeAnnotation,
  type LayoutName,
} from "@galaxy-tool-util/schema";
import { useContents } from "./useContents";

export interface UseCytoscapeBuildOptions {
  edgeAnnotations?: Map<string, EdgeAnnotation>;
}

export function useCytoscape() {
  const elements = ref<CytoscapeElements | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const { loadWorkflowContent } = useContents();

  async function build(path: string, opts: UseCytoscapeBuildOptions = {}): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const parsed = await loadWorkflowContent(path);
      elements.value = cytoscapeElements(parsed, {
        edgeAnnotations: opts.edgeAnnotations,
        layout: "preset",
      });
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      elements.value = null;
    } finally {
      loading.value = false;
    }
  }

  return { elements, loading, error, build };
}

// `(10*i, 10*i)` is the Python builder's positionless fallback — treat it as
// "no real positions" so IWC-style flows still get auto-layout.
export function pickRuntimeLayout(els: CytoscapeElements): LayoutName {
  const positions = els.nodes.map((n) => n.position).filter((p) => p != null);
  if (positions.length === 0) return "dagre";
  const trivial = els.nodes.every((n, i) => {
    const p = n.position;
    return p != null && p.x === 10 * i && p.y === 10 * i;
  });
  return trivial ? "dagre" : "preset";
}
