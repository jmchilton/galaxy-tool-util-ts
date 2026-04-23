<template>
  <div class="diagram" data-description="workflow diagram">
    <ProgressSpinner v-if="loading || rendering" style="width: 2rem; height: 2rem" />
    <Message v-if="error" severity="error" :closable="false" size="small">{{ error }}</Message>
    <div v-if="svg" class="diagram-svg" data-description="diagram svg" v-html="svg" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import { useMermaid } from "../composables/useMermaid";

const props = defineProps<{
  workflowPath: string;
}>();

const { diagram, loading, error, build } = useMermaid();
const svg = ref<string | null>(null);
const rendering = ref(false);

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
        securityLevel: "strict",
      });
      return mod.default;
    });
  }
  return mermaidPromise;
}

async function render() {
  svg.value = null;
  await build(props.workflowPath);
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

onMounted(() => {
  void render();
});

watch(
  () => props.workflowPath,
  () => {
    void render();
  },
);
</script>

<style scoped>
.diagram {
  display: flex;
  flex-direction: column;
  gap: var(--gx-sp-3);
  padding: var(--gx-sp-4) 0;
}

.diagram-svg {
  overflow: auto;
  padding: var(--gx-sp-3);
  background: var(--p-surface-0, #fff);
  border: 1px solid var(--p-surface-300, #dadadd);
  border-radius: 4px;
}

.diagram-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}

:global(.dark) .diagram-svg {
  background: var(--p-surface-900, #1a1f2e);
  border-color: var(--p-surface-700, #3a3f52);
}
</style>
