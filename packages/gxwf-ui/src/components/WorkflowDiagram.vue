<template>
  <div class="diagram" data-description="workflow diagram">
    <div class="diagram-toolbar">
      <ToggleButton
        v-model="annotateConnections"
        on-label="Map/reduce on"
        off-label="Map/reduce off"
        on-icon="pi pi-eye"
        off-icon="pi pi-eye-slash"
        size="small"
        data-description="annotate connections toggle"
      />
      <SelectButton
        v-model="renderer"
        :options="rendererOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        size="small"
        data-description="renderer toggle"
      />
    </div>
    <ProgressSpinner v-if="loading || rendering" style="width: 2rem; height: 2rem" />
    <Message v-if="error" severity="error" :closable="false" size="small">{{ error }}</Message>
    <div
      v-show="renderer === 'mermaid' && svg"
      class="diagram-svg"
      data-description="diagram svg"
      v-html="svg"
    />
    <div
      v-show="renderer === 'cytoscape'"
      ref="cytoCanvas"
      class="diagram-cytoscape"
      data-description="diagram cytoscape"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import SelectButton from "primevue/selectbutton";
import ToggleButton from "primevue/togglebutton";
import { useMermaid } from "../composables/useMermaid";
import { pickRuntimeLayout, useCytoscape } from "../composables/useCytoscape";
import { useEdgeAnnotationsAuto } from "../composables/useEdgeAnnotationsAuto";
import { cytoscapeStyle } from "../composables/cytoscapeStyle";
import { useTheme } from "../composables/useTheme";
import { elementsToList } from "@galaxy-tool-util/schema";
import type cytoscape from "cytoscape";
import type { Instance as TippyInstance } from "tippy.js";
type CytoscapeFactory = typeof cytoscape;
type CytoscapeCore = cytoscape.Core;
type CytoscapeElement = cytoscape.SingularElementArgument;

type Renderer = "mermaid" | "cytoscape";
const RENDERER_KEY = "gxwf-ui:diagram-renderer";
const ANNOTATE_KEY = "gxwf-ui:diagram-annotate";

const props = defineProps<{
  workflowPath: string;
}>();

function loadRenderer(): Renderer {
  try {
    const stored = localStorage.getItem(RENDERER_KEY);
    if (stored === "cytoscape" || stored === "mermaid") return stored;
  } catch {
    // localStorage unavailable (private mode, SSR) — fall back to default.
  }
  return "mermaid";
}

function loadAnnotate(): boolean {
  try {
    return localStorage.getItem(ANNOTATE_KEY) === "1";
  } catch {
    return false;
  }
}

const renderer = ref<Renderer>(loadRenderer());
const annotateConnections = ref<boolean>(loadAnnotate());
const rendererOptions = [
  { label: "Mermaid", value: "mermaid" },
  { label: "Cytoscape", value: "cytoscape" },
];

const { diagram, loading: mermaidLoading, error: mermaidError, build: buildMermaid } = useMermaid();
const {
  elements: cytoElements,
  loading: cytoLoading,
  error: cytoError,
  build: buildCyto,
} = useCytoscape();
const {
  annotations,
  loading: annotationsLoading,
  error: annotationsError,
  build: buildAnnotations,
  clear: clearAnnotations,
} = useEdgeAnnotationsAuto();

const loading = ref(false);
const rendering = ref(false);
const error = ref<string | null>(null);
const svg = ref<string | null>(null);
const cytoCanvas = ref<HTMLDivElement | null>(null);
let cy: CytoscapeCore | null = null;
let activeTippies: TippyInstance[] = [];
const { theme } = useTheme();

watch([mermaidLoading, cytoLoading, annotationsLoading], ([m, c, a]) => {
  loading.value = m || c || a;
});
watch([mermaidError, cytoError, annotationsError], ([m, c, a]) => {
  error.value = m ?? c ?? a ?? null;
});

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: theme.value === "dark" ? "dark" : "default",
        securityLevel: "strict",
      });
      return mod.default;
    });
  }
  return mermaidPromise;
}

let cytoLibPromise: Promise<CytoscapeFactory> | null = null;
async function getCytoscape(): Promise<CytoscapeFactory> {
  if (!cytoLibPromise) {
    cytoLibPromise = (async () => {
      const [cytoMod, dagreMod, popperMod] = await Promise.all([
        import("cytoscape"),
        import("cytoscape-dagre"),
        import("cytoscape-popper"),
      ]);
      const factory =
        (cytoMod as unknown as { default?: CytoscapeFactory }).default ??
        (cytoMod as unknown as CytoscapeFactory);
      const dagre = (dagreMod as unknown as { default?: unknown }).default ?? dagreMod;
      const popper = (popperMod as unknown as { default?: unknown }).default ?? popperMod;
      const useExt = (factory as unknown as { use: (ext: unknown) => void }).use;
      useExt(dagre);
      useExt(popper);
      return factory;
    })();
  }
  return cytoLibPromise;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPopupContent(ele: CytoscapeElement): HTMLElement {
  const container = document.createElement("div");
  const parts: string[] = [];
  if (ele.isNode()) {
    const stepType = ele.data("step_type");
    if (stepType) parts.push(`<p><i>Step Type:</i> ${escapeHtml(String(stepType))}</p>`);
    const toolId = ele.data("tool_id");
    if (toolId) parts.push(`<p><i>Tool ID:</i> ${escapeHtml(String(toolId))}</p>`);
    const repoLink = ele.data("repo_link");
    if (repoLink) {
      const href = escapeHtml(String(repoLink));
      parts.push(
        `<p><a href="${href}" target="_blank" rel="noopener">Tool Shed Repository</a></p>`,
      );
    }
    const doc = ele.data("doc");
    if (doc) parts.push(`<p>${escapeHtml(String(doc))}</p>`);
  } else {
    const output = ele.data("output");
    const input = ele.data("input");
    if (output) {
      parts.push(
        `<p>Output <code>${escapeHtml(String(output))}</code> → input <code>${escapeHtml(String(input))}</code></p>`,
      );
    } else if (input) {
      parts.push(`<p>Connected to input <code>${escapeHtml(String(input))}</code></p>`);
    }
    const mapDepth = ele.data("map_depth");
    if (mapDepth) {
      const mapping = ele.data("mapping");
      const suffix = mapping ? ` (${escapeHtml(String(mapping))})` : "";
      parts.push(`<p><i>Map depth:</i> ${escapeHtml(String(mapDepth))}${suffix}</p>`);
    }
    if (ele.data("reduction")) {
      parts.push(`<p><i>Reduction:</i> list → multi-data</p>`);
    }
  }
  container.innerHTML = parts.join("") || "<p><i>No details</i></p>";
  return container;
}

function destroyTippies(): void {
  for (const t of activeTippies) {
    try {
      t.destroy();
    } catch {
      // ignore
    }
  }
  activeTippies = [];
}

async function attachPopups(core: CytoscapeCore): Promise<void> {
  const tippyMod = await import("tippy.js");
  await import("tippy.js/dist/tippy.css");
  const tippy = (tippyMod as unknown as { default?: typeof tippyMod.default }).default ?? tippyMod;
  const popperMethod = (ele: CytoscapeElement) =>
    (ele as unknown as { popperRef: () => { getBoundingClientRect: () => DOMRect } }).popperRef();

  core.on("tap", "node, edge", (event) => {
    const ele = event.target as CytoscapeElement;
    const ref = popperMethod(ele);
    const dummy = document.createElement("div");
    const instance = (tippy as unknown as typeof import("tippy.js").default)(dummy, {
      getReferenceClientRect: ref.getBoundingClientRect.bind(ref),
      content: buildPopupContent(ele),
      allowHTML: true,
      interactive: true,
      placement: "bottom",
      trigger: "manual",
      appendTo: document.body,
      onHidden: (inst) => {
        inst.destroy();
        activeTippies = activeTippies.filter((t) => t !== inst);
      },
    });
    destroyTippies();
    activeTippies.push(instance);
    instance.show();
  });

  core.on("tap", (event) => {
    if (event.target === core) destroyTippies();
  });
}

async function ensureAnnotations(): Promise<
  Map<string, import("@galaxy-tool-util/schema").EdgeAnnotation> | undefined
> {
  if (!annotateConnections.value) {
    clearAnnotations();
    return undefined;
  }
  await buildAnnotations(props.workflowPath);
  return annotations.value ?? undefined;
}

async function renderMermaid() {
  svg.value = null;
  const edgeAnnotations = await ensureAnnotations();
  await buildMermaid(props.workflowPath, { edgeAnnotations });
  if (!diagram.value) return;
  rendering.value = true;
  try {
    const mermaid = await getMermaid();
    const id = `gxwf-mermaid-${Math.random().toString(36).slice(2)}`;
    const { svg: rendered } = await mermaid.render(id, diagram.value);
    svg.value = rendered;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    rendering.value = false;
  }
}

async function renderCytoscape() {
  const edgeAnnotations = await ensureAnnotations();
  await buildCyto(props.workflowPath, { edgeAnnotations });
  const els = cytoElements.value;
  if (!els || !cytoCanvas.value) return;
  rendering.value = true;
  try {
    const cytoscape = await getCytoscape();
    destroyTippies();
    if (cy) {
      cy.destroy();
      cy = null;
    }
    const layout = pickRuntimeLayout(els);
    cy = cytoscape({
      container: cytoCanvas.value,
      elements: elementsToList(els) as never,
      style: cytoscapeStyle(theme.value) as never,
      layout:
        layout === "dagre"
          ? ({ name: "dagre", rankDir: "LR", nodeSep: 40, rankSep: 80 } as never)
          : ({ name: "preset" } as never),
    }) as CytoscapeCore;
    await attachPopups(cy);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    rendering.value = false;
  }
}

async function render() {
  if (renderer.value === "mermaid") {
    await renderMermaid();
  } else {
    await renderCytoscape();
  }
}

watch(theme, (next) => {
  if (cy) {
    cy.style()
      .fromJson(cytoscapeStyle(next) as never)
      .update();
  }
  if (renderer.value === "mermaid") {
    mermaidPromise = null;
    void render();
  }
});

onMounted(() => {
  void render();
});

onBeforeUnmount(() => {
  destroyTippies();
  if (cy) {
    cy.destroy();
    cy = null;
  }
});

watch(
  () => props.workflowPath,
  () => {
    void render();
  },
);

watch(renderer, (next) => {
  try {
    localStorage.setItem(RENDERER_KEY, next);
  } catch {
    // ignore
  }
  void render();
});

watch(annotateConnections, (next) => {
  try {
    localStorage.setItem(ANNOTATE_KEY, next ? "1" : "0");
  } catch {
    // ignore
  }
  void render();
});
</script>

<style scoped>
.diagram {
  display: flex;
  flex-direction: column;
  gap: var(--gx-sp-3);
  padding: var(--gx-sp-4) 0;
}

.diagram-toolbar {
  display: flex;
  justify-content: flex-end;
}

.diagram-svg {
  overflow: auto;
  padding: var(--gx-sp-3);
  background: var(--p-content-background, #fff);
  border: 1px solid var(--p-content-border-color, #dadadd);
  border-radius: 4px;
}

.diagram-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}

.diagram-cytoscape {
  width: 100%;
  min-height: 480px;
  height: 60vh;
  background: var(--p-content-background, #fff);
  border: 1px solid var(--p-content-border-color, #dadadd);
  border-radius: 4px;
}
</style>
