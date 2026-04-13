<template>
  <div class="operation-report">
    <div class="summary-row">
      <Tag :value="`${sourceFormatLabel} → ${targetFormatLabel}`" severity="info" />
      <Tag v-if="result.dry_run" value="Dry run" severity="warn" />
      <Tag v-if="removedPath" :value="`Removes ${removedPath}`" severity="danger" />
      <Tag :value="summaryLabel" :severity="allOk ? 'success' : 'warn'" />
    </div>

    <div class="path-row">
      <div>
        <span class="path-label">Source:</span> <code>{{ result.source_path }}</code>
      </div>
      <div>
        <span class="path-label">Output:</span> <code>{{ result.output_path }}</code>
      </div>
      <div v-if="removedPath">
        <span class="path-label">Removed:</span> <code>{{ removedPath }}</code>
      </div>
    </div>

    <DataTable v-if="stepRows.length > 0" :value="stepRows" size="small">
      <Column field="step_id" header="Step" />
      <Column field="step_label" header="Label">
        <template #body="{ data }: { data: ExportStepRow }">
          <span v-if="data.step_label">{{ data.step_label }}</span>
          <span v-else class="muted">—</span>
        </template>
      </Column>
      <Column header="Tool">
        <template #body="{ data }: { data: ExportStepRow }">
          <ToolId v-if="data.tool_id" :tool-id="data.tool_id" />
          <span v-else class="muted">—</span>
        </template>
      </Column>
      <Column header="Status">
        <template #body="{ data }: { data: ExportStepRow }">
          <Tag
            :value="data.ok ? 'OK' : (data.error ?? 'Failed')"
            :severity="data.ok ? 'success' : 'danger'"
          />
        </template>
      </Column>
    </DataTable>

    <Panel
      v-if="result.content != null"
      header="Converted content"
      :toggleable="true"
      :collapsed="true"
    >
      <pre class="content-pre">{{ result.content }}</pre>
    </Panel>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Panel from "primevue/panel";
import Tag from "primevue/tag";
import type {
  ExportResult,
  ConvertResult,
  SingleExportReport,
  ToNativeResult,
  StepEncodeStatus,
} from "@galaxy-tool-util/schema";
import ToolId from "./ToolId.vue";

interface ExportStepRow {
  step_id: string;
  step_label: string | null;
  tool_id: string | null;
  ok: boolean;
  error: string | null;
}

const props = defineProps<{
  result: ExportResult | ConvertResult;
}>();

const removedPath = computed(() =>
  "removed_path" in props.result ? props.result.removed_path : null,
);

const isToNative = computed(() => props.result.target_format === "native");

const sourceFormatLabel = computed(() =>
  props.result.source_format === "native" ? "Native (.ga)" : "Format2 (.gxwf.yml)",
);
const targetFormatLabel = computed(() =>
  props.result.target_format === "native" ? "Native (.ga)" : "Format2 (.gxwf.yml)",
);

const stepRows = computed<ExportStepRow[]>(() => {
  if (isToNative.value) {
    const r = props.result.report as ToNativeResult;
    return (r.steps ?? []).map((s: StepEncodeStatus) => ({
      step_id: s.step_id,
      step_label: s.step_label,
      tool_id: s.tool_id,
      ok: s.encoded,
      error: s.error,
    }));
  }
  // Native → format2 report (SingleExportReport) carries counts but no per-step list.
  return [];
});

const allOk = computed(() => {
  if (isToNative.value) {
    return (props.result.report as ToNativeResult).all_encoded;
  }
  return (props.result.report as SingleExportReport).ok;
});

const summaryLabel = computed(() => {
  if (isToNative.value) {
    return (props.result.report as ToNativeResult).summary;
  }
  const r = props.result.report as SingleExportReport;
  const total = r.steps_converted + r.steps_fallback;
  return `${r.steps_converted}/${total} step${total !== 1 ? "s" : ""} converted`;
});
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

.path-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}

.path-label {
  color: var(--p-text-color-secondary, #6c757d);
  margin-right: 0.25rem;
}

.muted {
  color: var(--p-text-color-secondary, #6c757d);
  font-style: italic;
}

.content-pre {
  margin: 0;
  padding: 0.5rem;
  font-size: 0.75rem;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  color: var(--p-text-color);
  overflow: auto;
  max-height: 500px;
  white-space: pre;
}
</style>
