<template>
  <div class="cache-table">
    <div class="list-toolbar">
      <IconField class="search-field">
        <InputIcon class="pi pi-search" />
        <InputText v-model="filter" placeholder="Filter by tool id…" size="small" />
      </IconField>
      <Select
        v-model="sourceFilter"
        :options="sourceOptions"
        placeholder="All sources"
        showClear
        size="small"
        class="source-select"
      />
      <label class="undecodable-toggle">
        <Checkbox v-model="undecodableOnly" :binary="true" />
        <span>Undecodable only</span>
      </label>
      <span class="count">
        {{ filtered.length }}{{ filtered.length !== entries.length ? ` of ${entries.length}` : "" }}
        entries
      </span>
    </div>

    <DataTable
      :value="filtered"
      :loading="loading"
      dataKey="cacheKey"
      :rowHover="true"
      stripedRows
      sortField="cachedAt"
      :sortOrder="-1"
      :paginator="filtered.length > 25"
      :rows="25"
      :rowsPerPageOptions="[25, 50, 100]"
    >
      <template #empty>
        <div class="empty-state">
          <i class="pi pi-database empty-icon" />
          <p v-if="filter || sourceFilter || undecodableOnly">
            No entries match the current filters.
          </p>
          <p v-else>The tool cache is empty.</p>
        </div>
      </template>

      <Column field="toolId" header="Tool" sortable>
        <template #body="{ data: row }">
          <div class="tool-cell">
            <i
              v-if="!(row as Entry).decodable"
              class="pi pi-exclamation-triangle warn-icon"
              v-tooltip.right="'Cached payload does not decode as a ParsedTool'"
            />
            <span class="tool-id">{{ (row as Entry).toolId }}</span>
          </div>
        </template>
      </Column>
      <Column field="toolVersion" header="Version" sortable style="width: 10rem" />
      <Column field="source" header="Source" sortable style="width: 7rem">
        <template #body="{ data: row }">
          <Tag :value="(row as Entry).source" severity="secondary" />
        </template>
      </Column>
      <Column field="sizeBytes" header="Size" sortable style="width: 7rem">
        <template #body="{ data: row }">
          <span v-if="(row as Entry).sizeBytes !== undefined">
            {{ formatBytes((row as Entry).sizeBytes!) }}
          </span>
          <span v-else class="muted">—</span>
        </template>
      </Column>
      <Column field="cachedAt" header="Cached" sortable style="width: 11rem">
        <template #body="{ data: row }">
          <span :title="(row as Entry).cachedAt">{{
            formatRelative((row as Entry).cachedAt)
          }}</span>
        </template>
      </Column>
      <Column header="" style="width: 11rem; text-align: right">
        <template #body="{ data: row }">
          <Button
            icon="pi pi-eye"
            text
            size="small"
            @click="emit('view', row as Entry)"
            v-tooltip.left="'View raw JSON'"
          />
          <Button
            icon="pi pi-refresh"
            text
            size="small"
            :disabled="!(row as Entry).refetchable"
            @click="emit('refetch', row as Entry)"
            v-tooltip.left="
              (row as Entry).refetchable
                ? 'Re-fetch from source'
                : 'Cannot re-fetch — tool id is unknown/orphan'
            "
          />
          <a
            v-if="(row as Entry).toolshedUrl"
            :href="(row as Entry).toolshedUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button icon="pi pi-external-link" text size="small" v-tooltip.left="'Open ToolShed'" />
          </a>
          <Button
            icon="pi pi-trash"
            text
            size="small"
            severity="danger"
            @click="emit('delete', row as Entry)"
            v-tooltip.left="'Delete'"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Tag from "primevue/tag";
import type { components } from "@galaxy-tool-util/gxwf-client";

type Entry = components["schemas"]["CachedToolEntry"];

const props = defineProps<{ entries: Entry[]; loading?: boolean }>();
const emit = defineEmits<{
  view: [entry: Entry];
  refetch: [entry: Entry];
  delete: [entry: Entry];
}>();

const filter = ref("");
const sourceFilter = ref<string | null>(null);
const undecodableOnly = ref(false);

const sourceOptions = computed(() =>
  Array.from(new Set(props.entries.map((e) => e.source))).sort(),
);

const filtered = computed(() => {
  const q = filter.value.toLowerCase();
  return props.entries.filter((e) => {
    if (q && !e.toolId.toLowerCase().includes(q)) return false;
    if (sourceFilter.value && e.source !== sourceFilter.value) return false;
    if (undecodableOnly.value && e.decodable) return false;
    return true;
  });
});

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
</script>

<style scoped>
.list-toolbar {
  display: flex;
  align-items: center;
  gap: var(--gx-sp-3);
  margin-bottom: var(--gx-sp-3);
}

.source-select {
  min-width: 10rem;
}

.undecodable-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  font-size: var(--gx-fs-sm);
  cursor: pointer;
}

.count {
  margin-left: auto;
  font-size: var(--gx-fs-sm);
  color: var(--p-text-muted-color, #6b7280);
}

.tool-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}

.tool-id {
  font-family: var(--gx-mono);
}

.warn-icon {
  color: var(--p-orange-500, #f59e0b);
}

.muted {
  color: var(--p-text-muted-color, #6b7280);
}

.empty-state {
  text-align: center;
  padding: var(--gx-sp-6) var(--gx-sp-4);
  color: var(--p-text-muted-color, #6b7280);
}

.empty-icon {
  font-size: 2rem;
  display: block;
  margin-bottom: var(--gx-sp-2);
  opacity: 0.5;
}
</style>
