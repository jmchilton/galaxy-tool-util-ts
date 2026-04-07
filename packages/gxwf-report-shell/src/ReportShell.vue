<template>
  <div class="gxwf-report-shell">
    <header class="report-header">
      <span class="report-type">{{ typeLabel }}</span>
      <span v-if="workflowPath" class="report-path">{{ workflowPath }}</span>
    </header>
    <ValidationReport
      v-if="report.type === 'validate'"
      :report="report.data as SingleValidationReport"
    />
    <LintReport v-else-if="report.type === 'lint'" :report="report.data as SingleLintReport" />
    <CleanReport v-else-if="report.type === 'clean'" :report="report.data as SingleCleanReport" />
    <RoundtripReport
      v-else-if="report.type === 'roundtrip'"
      :report="report.data as SingleRoundTripReport"
    />
    <p v-else class="unknown-type">Unknown report type: {{ report.type }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ValidationReport from "./ValidationReport.vue";
import LintReport from "./LintReport.vue";
import CleanReport from "./CleanReport.vue";
import RoundtripReport from "./RoundtripReport.vue";
import type { components } from "@galaxy-tool-util/gxwf-client";

type SingleValidationReport = components["schemas"]["SingleValidationReport"];
type SingleLintReport = components["schemas"]["SingleLintReport"];
type SingleCleanReport = components["schemas"]["SingleCleanReport"];
type SingleRoundTripReport = components["schemas"]["SingleRoundTripReport"];

interface ReportPayload {
  type: "validate" | "lint" | "clean" | "roundtrip";
  data: unknown;
}

const props = defineProps<{ report: ReportPayload }>();

const typeLabel = computed(() => {
  const labels: Record<ReportPayload["type"], string> = {
    validate: "Validate",
    lint: "Lint",
    clean: "Clean",
    roundtrip: "Roundtrip",
  };
  return labels[props.report.type] ?? props.report.type;
});

const workflowPath = computed(() => {
  const d = props.report.data as Record<string, unknown> | null;
  return typeof d?.workflow === "string" ? d.workflow : null;
});
</script>

<style scoped>
.gxwf-report-shell {
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.report-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color, #dee2e6);
}

.report-type {
  font-size: 1.25rem;
  font-weight: 600;
  text-transform: capitalize;
  color: var(--p-text-color, #212529);
}

.report-path {
  font-family: monospace;
  font-size: 0.9rem;
  color: var(--p-text-color-secondary, #6c757d);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unknown-type {
  color: var(--p-text-color-secondary, #6c757d);
  font-style: italic;
}
</style>
