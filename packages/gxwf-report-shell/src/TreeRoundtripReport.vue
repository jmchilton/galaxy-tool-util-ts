<template>
  <div class="tree-report">
    <p class="root-path">
      Root: <code>{{ report.root }}</code>
    </p>
    <div class="summary-row">
      <Tag :value="`${report.summary.clean} clean`" severity="success" />
      <Tag
        v-if="report.summary.benign_only > 0"
        :value="`${report.summary.benign_only} benign`"
        severity="warn"
      />
      <Tag
        v-if="report.summary.fail > 0"
        :value="`${report.summary.fail} FAIL`"
        severity="danger"
      />
      <Tag
        v-if="report.summary.error > 0"
        :value="`${report.summary.error} error`"
        severity="danger"
      />
      <Tag
        v-if="report.summary.skipped > 0"
        :value="`${report.summary.skipped} skipped`"
        severity="secondary"
      />
    </div>

    <template v-for="cat in categories" :key="cat.name">
      <h3 class="category-heading">
        {{ cat.name }} <span class="category-count">({{ cat.workflows.length }})</span>
      </h3>
      <DataTable :value="cat.workflows" size="small" class="category-table">
        <Column field="workflow_path" header="Workflow" />
        <Column header="Status">
          <template #body="{ data }: { data: RoundTripValidationResult }">
            <Tag v-if="data.skipped_reason" value="SKIPPED" severity="secondary" />
            <Tag v-else-if="data.error" value="ERROR" severity="danger" />
            <Tag
              v-else-if="data.status === 'ok' && data.benign_diffs.length === 0"
              value="clean"
              severity="success"
            />
            <Tag v-else-if="data.status === 'ok'" value="benign" severity="warn" />
            <Tag v-else value="FAIL" severity="danger" />
          </template>
        </Column>
        <Column header="Details">
          <template #body="{ data }: { data: RoundTripValidationResult }">
            <span v-if="data.error" class="detail-note">{{ data.error }}</span>
            <span v-else-if="data.skipped_reason" class="detail-note">{{
              data.skipped_reason
            }}</span>
            <span v-else>
              <span v-if="data.error_diffs.length"
                >{{ data.error_diffs.length }} real diff{{
                  data.error_diffs.length !== 1 ? "s" : ""
                }}</span
              >
              <span v-if="data.benign_diffs.length && data.error_diffs.length">, </span>
              <span v-if="data.benign_diffs.length">{{ data.benign_diffs.length }} benign</span>
              <span v-if="!data.error_diffs.length && !data.benign_diffs.length" class="detail-note"
                >—</span
              >
            </span>
          </template>
        </Column>
      </DataTable>
    </template>

    <template v-if="report.tool_failure_modes.length">
      <h3 class="category-heading">Tool Failure Modes</h3>
      <DataTable :value="report.tool_failure_modes" size="small">
        <Column field="tool_id" header="Tool" />
        <Column field="failure_class" header="Failure Class" />
        <Column field="count" header="Count" />
      </DataTable>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RoundTripTreeReport, RoundTripValidationResult } from "@galaxy-tool-util/schema";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";

const props = defineProps<{ report: RoundTripTreeReport }>();

const categories = computed(() => {
  const groups = new Map<string, RoundTripValidationResult[]>();
  for (const wf of props.report.workflows) {
    const cat = wf.category || "(root)";
    let list = groups.get(cat);
    if (!list) {
      list = [];
      groups.set(cat, list);
    }
    list.push(wf);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, workflows]) => ({ name, workflows }));
});
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
