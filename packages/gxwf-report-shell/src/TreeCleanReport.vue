<template>
  <div class="tree-report">
    <p class="root-path">
      Root: <code>{{ report.root }}</code>
    </p>
    <div class="summary-row">
      <Tag
        :value="`${report.summary.affected} affected`"
        :severity="report.summary.affected > 0 ? 'warn' : 'secondary'"
      />
      <Tag :value="`${report.summary.clean} clean`" severity="success" />
      <Tag
        :value="`${report.summary.total_keys} key${report.summary.total_keys !== 1 ? 's' : ''} removed`"
        severity="secondary"
      />
      <Tag
        v-if="report.summary.errors > 0"
        :value="`${report.summary.errors} error${report.summary.errors !== 1 ? 's' : ''}`"
        severity="danger"
      />
      <Tag
        v-if="report.summary.skipped > 0"
        :value="`${report.summary.skipped} skipped`"
        severity="warn"
      />
    </div>

    <template v-for="cat in report.categories" :key="cat.name">
      <h3 class="category-heading">
        {{ cat.name }} <span class="category-count">({{ cat.results.length }})</span>
      </h3>
      <DataTable :value="cat.results" size="small" class="category-table">
        <Column field="name" header="Workflow" />
        <Column header="Status">
          <template #body="{ data }: { data: WorkflowCleanResult }">
            <Tag v-if="data.skipped_reason" value="SKIPPED" severity="warn" />
            <Tag v-else-if="data.error" value="ERROR" severity="danger" />
            <Tag
              v-else-if="data.total_removed > 0"
              :value="`${data.total_removed} removed`"
              severity="warn"
            />
            <Tag v-else value="clean" severity="success" />
          </template>
        </Column>
        <Column header="Keys / Steps">
          <template #body="{ data }: { data: WorkflowCleanResult }">
            <span v-if="data.error" class="detail-note">{{ data.error }}</span>
            <span v-else-if="data.skipped_reason" class="detail-note">{{
              data.skipped_reason
            }}</span>
            <span v-else>
              {{ data.total_removed }} key{{ data.total_removed !== 1 ? "s" : "" }},
              {{ data.steps_affected }} step{{ data.steps_affected !== 1 ? "s" : "" }}
            </span>
          </template>
        </Column>
      </DataTable>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { TreeCleanReport, WorkflowCleanResult } from "@galaxy-tool-util/schema";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";

defineProps<{ report: TreeCleanReport }>();
</script>

<style scoped>
.tree-report {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.root-path {
  font-family: monospace;
  color: var(--p-text-color-secondary, #6c757d);
  margin: 0;
}

.summary-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.category-heading {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--p-text-color, #212529);
}

.category-count {
  font-weight: 400;
  color: var(--p-text-color-secondary, #6c757d);
}

.category-table {
  margin-top: 0.25rem;
}

.detail-note {
  font-style: italic;
  color: var(--p-text-color-secondary, #6c757d);
}
</style>
