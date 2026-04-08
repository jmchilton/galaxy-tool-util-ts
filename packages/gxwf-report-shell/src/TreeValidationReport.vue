<template>
  <div class="tree-report">
    <p class="root-path">
      Root: <code>{{ report.root }}</code>
    </p>
    <div class="summary-row">
      <Tag :value="`${report.summary.ok} OK`" severity="success" />
      <Tag
        v-if="report.summary.fail > 0"
        :value="`${report.summary.fail} FAIL`"
        severity="danger"
      />
      <Tag
        v-if="report.summary.skip > 0"
        :value="`${report.summary.skip} skip`"
        severity="secondary"
      />
      <Tag
        v-if="report.summary.error > 0"
        :value="`${report.summary.error} error`"
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
          <template #body="{ data }: { data: WorkflowValidationResult }">
            <Tag v-if="data.skipped_reason" value="SKIPPED" severity="warn" />
            <Tag v-else-if="data.error" value="ERROR" severity="danger" />
            <Tag
              v-else-if="data.summary && data.summary.fail > 0"
              :value="`${data.summary.fail} FAIL`"
              severity="danger"
            />
            <Tag v-else value="OK" severity="success" />
          </template>
        </Column>
        <Column header="Steps">
          <template #body="{ data }: { data: WorkflowValidationResult }">
            <span v-if="data.summary">
              {{ data.summary.ok }} OK
              <span v-if="data.summary.fail"> / {{ data.summary.fail }} FAIL</span>
              <span v-if="data.summary.skip"> / {{ data.summary.skip }} skip</span>
            </span>
            <span v-else-if="data.error" class="detail-note">{{ data.error }}</span>
            <span v-else-if="data.skipped_reason" class="detail-note">{{
              data.skipped_reason
            }}</span>
          </template>
        </Column>
      </DataTable>
    </template>

    <template v-if="report.all_failures.length">
      <h3 class="category-heading">Failure Details</h3>
      <DataTable :value="report.all_failures" size="small">
        <Column field="workflow" header="Workflow" />
        <Column field="step" header="Step" />
        <Column field="tool_id" header="Tool" />
        <Column field="message" header="Message" />
      </DataTable>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { TreeValidationReport, WorkflowValidationResult } from "@galaxy-tool-util/schema";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";

defineProps<{ report: TreeValidationReport }>();
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
