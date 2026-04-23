<template>
  <div class="workflow-list">
    <div class="list-toolbar">
      <IconField class="search-field">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filter"
          placeholder="Filter by path…"
          size="small"
          data-description="workflow filter"
        />
      </IconField>
      <span class="count" data-description="workflow count">
        {{ filtered.length }}{{ filter ? ` of ${workflows.length}` : "" }} workflows
      </span>
    </div>
    <DataTable
      :value="filtered"
      :loading="loading"
      dataKey="relative_path"
      data-description="workflow list"
      @row-click="onRowClick"
      :rowHover="true"
      stripedRows
      sortField="relative_path"
      :sortOrder="1"
    >
      <template #empty>
        <div class="empty-state">
          <i class="pi pi-folder-open empty-icon" />
          <p v-if="filter">No workflows match "{{ filter }}".</p>
          <p v-else>No workflows found in this directory.</p>
        </div>
      </template>
      <Column field="relative_path" header="Path" sortable style="font-family: var(--gx-mono)">
        <template #body="{ data: row }">
          <span :data-description="`workflow list item ${(row as WorkflowEntry).relative_path}`">
            {{ (row as WorkflowEntry).relative_path }}
          </span>
        </template>
      </Column>
      <Column field="format" header="Format" sortable style="width: 8rem">
        <template #body="{ data: row }">
          <Tag :value="(row as WorkflowEntry).format" severity="secondary" />
        </template>
      </Column>
      <Column style="width: 2rem; padding: 0">
        <template #body>
          <i class="pi pi-angle-right row-chevron" aria-hidden="true" />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import InputText from "primevue/inputtext";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import type { DataTableRowClickEvent } from "primevue/datatable";
import type { components } from "@galaxy-tool-util/gxwf-client";

type WorkflowEntry = components["schemas"]["WorkflowEntry"];

const props = defineProps<{
  workflows: readonly WorkflowEntry[];
  loading: boolean;
}>();

const emit = defineEmits<{
  select: [workflow: WorkflowEntry];
}>();

const filter = ref("");

const filtered = computed(() => {
  if (!filter.value) return props.workflows;
  const q = filter.value.toLowerCase();
  return props.workflows.filter((w) => w.relative_path.toLowerCase().includes(q));
});

function onRowClick(event: DataTableRowClickEvent) {
  emit("select", event.data as WorkflowEntry);
}
</script>

<style scoped>
.workflow-list {
  display: flex;
  flex-direction: column;
  gap: var(--gx-sp-3);
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: var(--gx-sp-4);
}

.search-field {
  flex: 0 0 20rem;
  max-width: 100%;
}

.search-field :deep(input) {
  width: 100%;
}

.count {
  font-size: var(--gx-fs-sm);
  color: var(--p-text-color-secondary, #6c757d);
}

.row-chevron {
  color: var(--p-text-color-secondary, #6c757d);
  opacity: 0.6;
  font-size: var(--gx-fs-sm);
}

.empty-state {
  text-align: center;
  padding: var(--gx-sp-8) var(--gx-sp-4);
  color: var(--p-text-color-secondary, #6c757d);
}

.empty-icon {
  font-size: 2rem;
  display: block;
  margin-bottom: 0.5rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
}
</style>
