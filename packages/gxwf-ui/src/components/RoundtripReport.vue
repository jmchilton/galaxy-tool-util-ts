<template>
  <div class="operation-report">
    <div class="summary-row">
      <Tag
        :value="result.ok ? 'pass' : 'fail'"
        :severity="result.ok ? 'success' : 'danger'"
        class="status-tag"
      />
      <span class="summary-line">{{ result.summary_line }}</span>
    </div>

    <Message v-if="result.error" severity="error" :closable="false">{{ result.error }}</Message>

    <template v-if="result.conversion_failure_lines.length">
      <h4 class="section-heading">Conversion Failures</h4>
      <ul class="failure-list">
        <li v-for="(line, i) in result.conversion_failure_lines" :key="i">
          <code>{{ line }}</code>
        </li>
      </ul>
    </template>

    <template v-if="result.error_diffs.length">
      <p class="section-heading"><Tag value="error" severity="danger" /> Diffs</p>
      <DataTable :value="result.error_diffs" size="small">
        <Column field="step_path" header="Step" />
        <Column field="key_path" header="Key" />
        <Column field="description" header="Description" />
      </DataTable>
    </template>

    <template v-if="result.benign_diffs.length">
      <p class="section-heading"><Tag value="benign" severity="secondary" /> Diffs</p>
      <DataTable :value="result.benign_diffs" size="small">
        <Column field="step_path" header="Step" />
        <Column field="key_path" header="Key" />
        <Column field="description" header="Description" />
      </DataTable>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import Message from "primevue/message";
import type { components } from "@galaxy-tool-util/gxwf-client";

type SingleRoundTripReport = components["schemas"]["SingleRoundTripReport"];

const props = defineProps<{
  report: SingleRoundTripReport;
}>();

const result = computed(() => props.report.result);
</script>

<style scoped>
.operation-report {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.summary-line {
  font-size: 0.9rem;
  color: var(--p-text-color-secondary, #6c757d);
}

.section-heading {
  margin: 0.25rem 0 0;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.failure-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.85rem;
}
</style>
