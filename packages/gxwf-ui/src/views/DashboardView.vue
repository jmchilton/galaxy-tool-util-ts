<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Workflows</h1>
        <p v-if="directory" class="directory-path">{{ directory }}</p>
      </div>
      <Button label="Refresh" icon="pi pi-refresh" :loading="loading" @click="refreshWorkflows" />
    </div>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <WorkflowList :workflows="workflows" :loading="loading" @select="handleSelect" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Message from "primevue/message";
import WorkflowList from "../components/WorkflowList.vue";
import { useWorkflows } from "../composables/useWorkflows";
import type { components } from "@galaxy-tool-util/gxwf-client";

type WorkflowEntry = components["schemas"]["WorkflowEntry"];

const router = useRouter();
const { workflows, directory, loading, error, fetchWorkflows, refreshWorkflows, selectWorkflow } =
  useWorkflows();

onMounted(async () => {
  await fetchWorkflows();
});

function handleSelect(workflow: WorkflowEntry) {
  selectWorkflow(workflow);
  void router.push(`/workflow/${workflow.relative_path}`);
}
</script>

<style scoped>
.view-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.view-header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
}

.directory-path {
  margin: 0;
  font-size: 0.875rem;
  font-family: monospace;
  color: var(--p-text-color-secondary, #6c757d);
}
</style>
