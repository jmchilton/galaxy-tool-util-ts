<template>
  <div class="operation-report">
    <Message v-if="report.skipped_reason" severity="warn" :closable="false">
      Skipped: {{ report.skipped_reason }}
    </Message>

    <template v-if="structureErrors.length || encodingErrors.length">
      <Message severity="error" :closable="false">
        <ul class="error-list">
          <li v-for="(e, i) in structureErrors" :key="'s' + i">{{ e }}</li>
          <li v-for="(e, i) in encodingErrors" :key="'e' + i">{{ e }}</li>
        </ul>
      </Message>
    </template>

    <Panel
      v-if="report.clean_report != null"
      header="Pre-validation clean"
      :toggleable="true"
      :collapsed="true"
    >
      <CleanReport :report="report.clean_report" />
    </Panel>

    <div class="summary-row">
      <Tag
        v-for="(count, key) in report.summary"
        :key="key"
        :value="`${key}: ${count}`"
        :severity="key === 'ok' ? 'success' : key === 'fail' ? 'danger' : 'secondary'"
      />
    </div>

    <DataTable :value="report.results" size="small" class="results-table">
      <Column field="step" header="Step" />
      <Column header="Tool">
        <template #body="{ data }: { data: ValidationStepResult }">
          <ToolId :tool-id="data.tool_id" />
        </template>
      </Column>
      <Column header="Status">
        <template #body="{ data }: { data: ValidationStepResult }">
          <Tag :value="data.status" :severity="statusSeverity(data.status)" />
        </template>
      </Column>
      <Column header="Errors">
        <template #body="{ data }: { data: ValidationStepResult }">
          <ul v-if="data.errors.length" class="error-list">
            <li v-for="(e, i) in data.errors" :key="i">{{ e }}</li>
          </ul>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SingleValidationReport, ValidationStepResult } from "@galaxy-tool-util/schema";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Panel from "primevue/panel";
import Tag from "primevue/tag";
import Message from "primevue/message";
import CleanReport from "./CleanReport.vue";
import ToolId from "./ToolId.vue";

const props = defineProps<{
  report: SingleValidationReport;
}>();

const structureErrors = computed(() => props.report.structure_errors ?? []);
const encodingErrors = computed(() => props.report.encoding_errors ?? []);

function statusSeverity(status: ValidationStepResult["status"]) {
  if (status === "ok") return "success";
  if (status === "fail") return "danger";
  return "secondary";
}
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

.results-table {
  margin-top: 0.5rem;
}

.error-list {
  margin: 0;
  padding-left: 1.25rem;
}
</style>
