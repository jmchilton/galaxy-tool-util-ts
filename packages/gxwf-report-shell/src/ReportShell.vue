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
    <TreeValidationReport
      v-else-if="report.type === 'validate-tree'"
      :report="report.data as TreeValidationReportData"
    />
    <TreeLintReport
      v-else-if="report.type === 'lint-tree'"
      :report="report.data as LintTreeReportData"
    />
    <TreeCleanReport
      v-else-if="report.type === 'clean-tree'"
      :report="report.data as TreeCleanReportData"
    />
    <TreeRoundtripReport
      v-else-if="report.type === 'roundtrip-tree'"
      :report="report.data as RoundTripTreeReportData"
    />
    <p v-else class="unknown-type">Unknown report type: {{ report.type }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type {
  SingleValidationReport,
  SingleLintReport,
  SingleCleanReport,
  SingleRoundTripReport,
  TreeValidationReport as TreeValidationReportData,
  LintTreeReport as LintTreeReportData,
  TreeCleanReport as TreeCleanReportData,
  RoundTripTreeReport as RoundTripTreeReportData,
} from "@galaxy-tool-util/schema";
import ValidationReport from "./ValidationReport.vue";
import LintReport from "./LintReport.vue";
import CleanReport from "./CleanReport.vue";
import RoundtripReport from "./RoundtripReport.vue";
import TreeValidationReport from "./TreeValidationReport.vue";
import TreeLintReport from "./TreeLintReport.vue";
import TreeCleanReport from "./TreeCleanReport.vue";
import TreeRoundtripReport from "./TreeRoundtripReport.vue";

interface ReportPayload {
  type:
    | "validate"
    | "lint"
    | "clean"
    | "roundtrip"
    | "validate-tree"
    | "lint-tree"
    | "clean-tree"
    | "roundtrip-tree";
  data: unknown;
}

const props = defineProps<{ report: ReportPayload }>();

const typeLabel = computed(() => {
  const labels: Record<ReportPayload["type"], string> = {
    validate: "Validate",
    lint: "Lint",
    clean: "Clean",
    roundtrip: "Roundtrip",
    "validate-tree": "Validate Tree",
    "lint-tree": "Lint Tree",
    "clean-tree": "Clean Tree",
    "roundtrip-tree": "Roundtrip Tree",
  };
  return labels[props.report.type] ?? props.report.type;
});

const workflowPath = computed(() => {
  const d = props.report.data as Record<string, unknown> | null;
  if (typeof d?.workflow === "string") return d.workflow;
  if (typeof d?.root === "string") return d.root;
  return null;
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
