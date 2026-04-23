<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Workflows</h1>
        <p v-if="directory" class="directory-path" :title="directory">
          <i class="pi pi-folder" /> {{ directory }}
        </p>
      </div>
      <Button
        label="Refresh"
        icon="pi pi-refresh"
        text
        :loading="loading"
        @click="refreshWorkflows"
        v-tooltip.left="'Re-scan the workflows directory'"
      />
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
  gap: var(--gx-sp-4);
  margin-bottom: 1rem;
}

.view-header h1 {
  margin: 0 0 var(--gx-sp-1);
  font-size: var(--gx-fs-xl);
  font-weight: 600;
}

.directory-path {
  margin: 0;
  font-size: var(--gx-fs-sm);
  font-family: var(--gx-mono);
  color: var(--p-text-color-secondary, #6c757d);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 60ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-path .pi {
  font-size: 0.8rem;
  opacity: 0.7;
}
</style>
