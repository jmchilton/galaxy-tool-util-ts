<template>
  <div class="operation-report">
    <div class="summary-row">
      <Tag
        :value="`${report.total_removed} key${report.total_removed !== 1 ? 's' : ''} removed`"
        :severity="report.total_removed > 0 ? 'warn' : 'success'"
      />
      <Tag
        :value="`${report.steps_with_removals} step${report.steps_with_removals !== 1 ? 's' : ''} affected`"
        severity="secondary"
      />
    </div>

    <DataTable :value="report.results" size="small">
      <Column header="Step">
        <template #body="{ data }: { data: CleanStepResult }">
          {{ data.display_label }}
        </template>
      </Column>
      <Column header="Removed Keys">
        <template #body="{ data }: { data: CleanStepResult }">
          <span v-if="data.skipped" class="skip-reason">{{ data.skip_reason || "skipped" }}</span>
          <span v-else-if="data.removed_keys.length === 0" class="no-changes">—</span>
          <ul v-else class="key-list">
            <li v-for="(k, i) in data.removed_keys" :key="i">
              <code>{{ k }}</code>
            </li>
          </ul>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import type { components } from "@galaxy-tool-util/gxwf-client";

type SingleCleanReport = components["schemas"]["SingleCleanReport"];
type CleanStepResult = components["schemas"]["CleanStepResult"];

defineProps<{
  report: SingleCleanReport;
}>();
</script>

<style scoped>
.operation-report {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.summary-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.key-list {
  margin: 0;
  padding-left: 1.25rem;
}

.skip-reason,
.no-changes {
  color: var(--p-text-color-secondary, #6c757d);
  font-style: italic;
}
</style>
