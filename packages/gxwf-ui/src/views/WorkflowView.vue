<template>
  <div
    class="workflow-view"
    :class="{ 'has-drawer': activeOp !== null }"
    data-description="workflow view"
  >
    <div class="view-header">
      <Button
        icon="pi pi-arrow-left"
        text
        rounded
        @click="router.push('/')"
        aria-label="Back to workflows"
        v-tooltip.right="'Back to workflows'"
      />
      <div class="header-main">
        <div class="title-row">
          <h1 data-description="workflow view path">{{ displayName }}</h1>
          <Tag
            v-if="workflowMeta"
            :value="workflowMeta.format"
            severity="secondary"
            v-tooltip.top="'Workflow format'"
          />
        </div>
        <p v-if="workflowPath" class="path-line" :title="workflowPath">{{ workflowPath }}</p>
      </div>
    </div>

    <div class="diagram-region" data-description="diagram region">
      <p class="help">Visual map of steps, inputs, outputs, and connections.</p>
      <WorkflowDiagram :workflow-path="workflowPath" />
    </div>

    <ToolStrip :active-op="activeOp" @open-op="openOp" />

    <ResultDrawer v-if="activeOp" :op="activeOp" class="drawer-region" @close="closeDrawer">
      <OperationPanel :workflow-path="workflowPath" :op="activeOp" />
    </ResultDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Tag from "primevue/tag";
import WorkflowDiagram from "../components/WorkflowDiagram.vue";
import ToolStrip from "../components/ToolStrip.vue";
import ResultDrawer from "../components/ResultDrawer.vue";
import OperationPanel from "../components/OperationPanel.vue";
import { useWorkflows } from "../composables/useWorkflows";
import type { OperationName } from "../composables/useOperation";

const route = useRoute();
const router = useRouter();
const { workflows } = useWorkflows();

const workflowPath = computed(() => route.params.path as string);

const displayName = computed(() => {
  const p = workflowPath.value;
  const slash = p.lastIndexOf("/");
  return slash >= 0 ? p.slice(slash + 1) : p;
});

const workflowMeta = computed(
  () => workflows.value.find((w) => w.relative_path === workflowPath.value) ?? null,
);

const VALID_OPS: readonly OperationName[] = [
  "validate",
  "lint",
  "clean",
  "roundtrip",
  "export",
  "convert",
];

function parseOpParam(value: unknown): OperationName | null {
  if (typeof value !== "string") return null;
  return (VALID_OPS as readonly string[]).includes(value) ? (value as OperationName) : null;
}

const activeOp = ref<OperationName | null>(null);

onMounted(() => {
  activeOp.value = parseOpParam(route.query.op);
});

watch(
  () => route.query.op,
  (next) => {
    activeOp.value = parseOpParam(next);
  },
);

function openOp(op: OperationName) {
  if (activeOp.value === op) return;
  void router.replace({ query: { ...route.query, op } });
}

function closeDrawer() {
  const { op: _op, ...rest } = route.query;
  void router.replace({ query: rest });
}
</script>

<style scoped>
.workflow-view {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas:
    "header"
    "diagram"
    "strip"
    "drawer";
  gap: var(--gx-sp-4);
}

.view-header {
  grid-area: header;
  display: flex;
  align-items: flex-start;
  gap: var(--gx-sp-2);
}

.diagram-region {
  grid-area: diagram;
  display: flex;
  flex-direction: column;
  gap: var(--gx-sp-2);
  min-height: 0;
}

.diagram-region :deep(.diagram) {
  padding: 0;
}

:deep(.tool-strip) {
  grid-area: strip;
}

.drawer-region {
  grid-area: drawer;
}

@media (min-width: 1280px) {
  .workflow-view.has-drawer {
    grid-template-columns: minmax(0, 1fr) 480px;
    grid-template-areas:
      "header  header"
      "diagram drawer"
      "strip   drawer";
  }

  .workflow-view.has-drawer .drawer-region {
    max-height: calc(100vh - 8rem);
  }
}

@media (min-width: 1600px) {
  .workflow-view.has-drawer {
    grid-template-columns: minmax(0, 1fr) 560px;
  }
}

@media (min-width: 1920px) {
  .workflow-view.has-drawer {
    grid-template-columns: minmax(0, 1fr) 640px;
  }
}

.header-main {
  flex: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: var(--gx-sp-2);
  margin: 0 0 var(--gx-sp-1);
}

.title-row h1 {
  margin: 0;
  font-size: var(--gx-fs-lg);
  font-weight: 600;
}

.path-line {
  margin: 0;
  font-size: var(--gx-fs-xs);
  font-family: var(--gx-mono);
  color: var(--p-text-color-secondary, #6c757d);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.help {
  margin: 0;
  font-size: var(--gx-fs-sm);
  color: var(--p-text-color-secondary, #6c757d);
}
</style>
