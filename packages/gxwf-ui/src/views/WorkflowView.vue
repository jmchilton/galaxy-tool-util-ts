<template>
  <div>
    <div class="view-header">
      <Button icon="pi pi-arrow-left" text rounded @click="router.push('/')" aria-label="Back" />
      <div>
        <h1>{{ workflowPath }}</h1>
        <div v-if="workflowMeta" class="workflow-meta">
          <Tag :value="workflowMeta.format" severity="secondary" />
          <Tag v-if="workflowMeta.category" :value="workflowMeta.category" severity="info" />
        </div>
      </div>
    </div>

    <OperationPanel :workflow-path="workflowPath" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Tag from "primevue/tag";
import OperationPanel from "../components/OperationPanel.vue";
import { useWorkflows } from "../composables/useWorkflows";

const route = useRoute();
const router = useRouter();
const { workflows } = useWorkflows();

const workflowPath = computed(() => route.params.path as string);

const workflowMeta = computed(
  () => workflows.value.find((w) => w.relative_path === workflowPath.value) ?? null,
);
</script>

<style scoped>
.view-header {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.view-header h1 {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  font-family: monospace;
}

.workflow-meta {
  display: flex;
  gap: 0.4rem;
}
</style>
