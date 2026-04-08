<template>
  <div class="tree-report">
    <p class="root-path">
      Root: <code>{{ report.root }}</code>
    </p>
    <div class="summary-row">
      <Tag
        :value="`${report.summary.lint_errors} lint error${report.summary.lint_errors !== 1 ? 's' : ''}`"
        :severity="report.summary.lint_errors > 0 ? 'danger' : 'success'"
      />
      <Tag
        :value="`${report.summary.lint_warnings} warning${report.summary.lint_warnings !== 1 ? 's' : ''}`"
        :severity="report.summary.lint_warnings > 0 ? 'warn' : 'secondary'"
      />
      <Tag
        v-if="report.summary.errors > 0"
        :value="`${report.summary.errors} file error${report.summary.errors !== 1 ? 's' : ''}`"
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
          <template #body="{ data }: { data: LintWorkflowResult }">
            <Tag v-if="data.skipped_reason" value="SKIPPED" severity="warn" />
            <Tag v-else-if="data.error" value="ERROR" severity="danger" />
            <Tag
              v-else-if="data.lint_errors > 0"
              :value="`${data.lint_errors} error${data.lint_errors !== 1 ? 's' : ''}`"
              severity="danger"
            />
            <Tag v-else value="OK" severity="success" />
          </template>
        </Column>
        <Column header="Lint">
          <template #body="{ data }: { data: LintWorkflowResult }">
            <span v-if="data.error" class="detail-note">{{ data.error }}</span>
            <span v-else-if="data.skipped_reason" class="detail-note">{{
              data.skipped_reason
            }}</span>
            <span v-else>{{ data.lint_errors }} err, {{ data.lint_warnings }} warn</span>
          </template>
        </Column>
      </DataTable>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { LintTreeReport, LintWorkflowResult } from "@galaxy-tool-util/schema";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";

defineProps<{ report: LintTreeReport }>();
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
