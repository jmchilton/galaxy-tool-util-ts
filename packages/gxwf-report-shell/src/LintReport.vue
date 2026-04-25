<template>
  <div class="operation-report">
    <template v-if="structureErrors.length || encodingErrors.length">
      <Message severity="error" :closable="false">
        <ul class="error-list">
          <li v-for="(e, i) in structureErrors" :key="'s' + i">{{ e }}</li>
          <li v-for="(e, i) in encodingErrors" :key="'e' + i">{{ e }}</li>
        </ul>
      </Message>
    </template>

    <div class="summary-row">
      <Tag
        :value="`${report.lint_errors} error${report.lint_errors !== 1 ? 's' : ''}`"
        :severity="report.lint_errors > 0 ? 'danger' : 'success'"
      />
      <Tag
        :value="`${report.lint_warnings} warning${report.lint_warnings !== 1 ? 's' : ''}`"
        :severity="report.lint_warnings > 0 ? 'warn' : 'secondary'"
      />
    </div>

    <Message
      v-if="lintErrorMessages.length"
      severity="error"
      :closable="false"
      data-description="lint errors"
    >
      <ul class="message-list">
        <li v-for="(m, i) in lintErrorMessages" :key="'le' + i">{{ m }}</li>
      </ul>
    </Message>

    <Message
      v-if="lintWarningMessages.length"
      severity="warn"
      :closable="false"
      data-description="lint warnings"
    >
      <ul class="message-list">
        <li v-for="(m, i) in lintWarningMessages" :key="'lw' + i">{{ m }}</li>
      </ul>
    </Message>

    <DataTable
      v-if="report.results.length"
      :value="report.results"
      size="small"
      class="results-table"
    >
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
import type { SingleLintReport, ValidationStepResult } from "@galaxy-tool-util/schema";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import Message from "primevue/message";
import ToolId from "./ToolId.vue";

const props = defineProps<{
  report: SingleLintReport;
}>();

const structureErrors = computed(() => props.report.structure_errors ?? []);
const encodingErrors = computed(() => props.report.encoding_errors ?? []);
const lintErrorMessages = computed(() => props.report.lint_error_messages ?? []);
const lintWarningMessages = computed(() => props.report.lint_warning_messages ?? []);

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

.error-list,
.message-list {
  margin: 0;
  padding-left: 1.25rem;
}

.message-list li + li {
  margin-top: 0.25rem;
}
</style>
