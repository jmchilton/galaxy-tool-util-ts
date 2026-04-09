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
      <Column field="step" header="Step" />
      <Column header="Tool">
        <template #body="{ data }: { data: CleanStepResult }">
          <ToolId :tool-id="data.tool_id" />
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

    <Panel
      v-if="report.before_content != null || report.after_content != null"
      header="Workflow content"
      :toggleable="true"
      :collapsed="true"
    >
      <div class="content-panes">
        <div class="content-pane">
          <div class="pane-label">Before</div>
          <pre class="content-pre">{{ report.before_content ?? "(none)" }}</pre>
        </div>
        <div class="content-pane">
          <div class="pane-label">After</div>
          <pre class="content-pre">{{ report.after_content ?? "(none)" }}</pre>
        </div>
      </div>
    </Panel>
  </div>
</template>

<script setup lang="ts">
import DataTable from "primevue/datatable";
import Panel from "primevue/panel";
import type { SingleCleanReport, CleanStepResult } from "@galaxy-tool-util/schema";
import Column from "primevue/column";
import Tag from "primevue/tag";
import ToolId from "./ToolId.vue";

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

.content-panes {
  display: flex;
  gap: 1rem;
}

.content-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.pane-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-color-secondary, #6c757d);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.content-pre {
  margin: 0;
  padding: 0.5rem;
  font-size: 0.75rem;
  background: var(--p-surface-100, #f8f9fa);
  border: 1px solid var(--p-surface-300, #dee2e6);
  border-radius: 4px;
  overflow: auto;
  max-height: 400px;
  white-space: pre;
}
</style>
