<template>
  <!-- selectionMode intentionally omitted: selection highlight is managed by the
       parent via router navigation; using @row-click alone avoids one-way :selection
       binding bugs where the DataTable's internal state can diverge from the prop. -->
  <DataTable
    :value="workflows"
    :loading="loading"
    dataKey="relative_path"
    data-description="workflow list"
    @row-click="onRowClick"
    :rowHover="true"
    stripedRows
  >
    <template #empty>No workflows found.</template>
    <Column field="relative_path" header="Path" style="font-family: monospace">
      <template #body="{ data: row }">
        <span :data-description="`workflow list item ${(row as WorkflowEntry).relative_path}`">
          {{ (row as WorkflowEntry).relative_path }}
        </span>
      </template>
    </Column>
    <Column field="format" header="Format">
      <template #body="{ data: row }">
        <Tag :value="(row as WorkflowEntry).format" severity="secondary" />
      </template>
    </Column>
    <Column header="Last Run">
      <template #body="{ data: row }">
        <Tag
          v-if="statusMap[(row as WorkflowEntry).relative_path]"
          :value="statusMap[(row as WorkflowEntry).relative_path]!"
          :severity="
            statusMap[(row as WorkflowEntry).relative_path] === 'ok' ? 'success' : 'danger'
          "
        />
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import type { DataTableRowClickEvent } from "primevue/datatable";
import type { components } from "@galaxy-tool-util/gxwf-client";
import { getLastRunStatus, opCache } from "../composables/useOperation";

type WorkflowEntry = components["schemas"]["WorkflowEntry"];

const props = defineProps<{
  workflows: readonly WorkflowEntry[];
  loading: boolean;
}>();

const emit = defineEmits<{
  select: [workflow: WorkflowEntry];
}>();

// Reactive map of path → status. getLastRunStatus reads opCache[path] for
// each workflow, so Vue tracks those accesses and re-evaluates when ops finish.
const statusMap = computed(() => {
  const map: Record<string, "ok" | "fail" | null> = {};
  for (const wf of props.workflows) {
    map[wf.relative_path] = getLastRunStatus(wf.relative_path);
  }
  return map;
});

function onRowClick(event: DataTableRowClickEvent) {
  emit("select", event.data as WorkflowEntry);
}
</script>
