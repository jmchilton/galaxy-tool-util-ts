<template>
  <div class="op-panel" :data-description="`${op} panel`">
    <div v-if="op === 'lint'" class="panel-content" data-description="lint result panel">
      <p class="help">
        Style and quality warnings — unused outputs, missing annotations, suspicious defaults.
      </p>
      <div class="panel-toolbar">
        <Button
          label="Re-run"
          icon="pi pi-refresh"
          text
          size="small"
          :loading="lintLoading"
          data-description="run lint operation"
          @click="() => void runLint(lintOpts)"
        />
        <label class="opt-label" v-tooltip.top="'Fail on structural issues.'">
          <Checkbox v-model="lintOpts.strict_structure" :binary="true" size="small" />
          Strict structure
        </label>
        <label
          class="opt-label"
          v-tooltip.top="'Fail on encoding quirks (legacy type hints, etc).'"
        >
          <Checkbox v-model="lintOpts.strict_encoding" :binary="true" size="small" />
          Strict encoding
        </label>
        <ToggleButton
          v-if="lintResult"
          v-model="showRaw.lint"
          onLabel="Raw JSON"
          offLabel="Formatted"
          onIcon="pi pi-code"
          offIcon="pi pi-list"
          size="small"
        />
        <Message v-if="lintError" severity="error" :closable="false" size="small">
          {{ lintError }}
        </Message>
      </div>
      <div :class="{ 'result-area': true, stale: lintLoading && lintResult }">
        <RawJsonView v-if="lintResult && showRaw.lint" :data="lintResult" />
        <LintReport v-else-if="lintResult" :report="lintResult" />
        <p v-else-if="!lintLoading" class="no-results">No results yet.</p>
      </div>
    </div>

    <div v-else-if="op === 'export'" class="panel-content" data-description="export result panel">
      <p class="help">
        Preview of the format2 sibling that would be written alongside the original. Click
        <strong>Write sibling</strong> to save it to disk.
      </p>
      <div class="panel-toolbar">
        <Button
          label="Write sibling"
          icon="pi pi-save"
          size="small"
          :loading="exportLoading"
          :disabled="!exportResult || exportLoading"
          data-description="apply export operation"
          @click="() => void handleExportApply()"
        />
        <ToggleButton
          v-if="exportResult"
          v-model="showRaw.export"
          onLabel="Raw JSON"
          offLabel="Formatted"
          onIcon="pi pi-code"
          offIcon="pi pi-list"
          size="small"
        />
        <Message v-if="exportError" severity="error" :closable="false" size="small">
          {{ exportError }}
        </Message>
      </div>
      <div :class="{ 'result-area': true, stale: exportLoading && exportResult }">
        <RawJsonView v-if="exportResult && showRaw.export" :data="exportResult" />
        <ExportReport v-else-if="exportResult" :result="exportResult" />
        <p v-else-if="!exportLoading" class="no-results">Loading preview…</p>
      </div>
    </div>

    <div
      v-else-if="op === 'validate'"
      class="panel-content"
      data-description="validate result panel"
    >
      <p class="help">Schema validation — structural and semantic correctness of the file.</p>
      <div class="panel-toolbar">
        <Button
          label="Re-run"
          icon="pi pi-refresh"
          text
          size="small"
          :loading="validateLoading"
          data-description="run validate operation"
          @click="() => void runValidate(validateOpts)"
        />
        <Select
          v-model="validateOpts.mode"
          :options="modeOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="mode-select"
          v-tooltip.top="'Validator backend.'"
        />
        <label class="opt-label">
          <Checkbox v-model="validateOpts.strict_structure" :binary="true" size="small" />
          Strict structure
        </label>
        <label class="opt-label">
          <Checkbox v-model="validateOpts.strict_encoding" :binary="true" size="small" />
          Strict encoding
        </label>
        <label
          class="opt-label"
          v-tooltip.top="'Run Clean (in-memory) before validating to normalize the document.'"
        >
          <Checkbox v-model="validateOpts.clean_first" :binary="true" size="small" />
          Clean first
        </label>
        <ToggleButton
          v-if="validateResult"
          v-model="showRaw.validate"
          onLabel="Raw JSON"
          offLabel="Formatted"
          onIcon="pi pi-code"
          offIcon="pi pi-list"
          size="small"
        />
        <Message v-if="validateError" severity="error" :closable="false" size="small">
          {{ validateError }}
        </Message>
      </div>
      <div :class="{ 'result-area': true, stale: validateLoading && validateResult }">
        <RawJsonView v-if="validateResult && showRaw.validate" :data="validateResult" />
        <ValidationReport v-else-if="validateResult" :report="validateResult" />
        <p v-else-if="!validateLoading" class="no-results">No results yet.</p>
      </div>
    </div>

    <div v-else-if="op === 'clean'" class="panel-content" data-description="clean result panel">
      <p class="help">
        Preview of what Clean would strip (UI-only state, stale tool_state). Click
        <strong>Apply</strong> to rewrite the file in place.
      </p>
      <div class="panel-toolbar">
        <Button
          label="Apply"
          icon="pi pi-save"
          size="small"
          :loading="cleanLoading"
          :disabled="!cleanResult || cleanLoading"
          data-description="apply clean operation"
          @click="() => void handleCleanApply()"
        />
        <ToggleButton
          v-if="cleanResult"
          v-model="showRaw.clean"
          onLabel="Raw JSON"
          offLabel="Formatted"
          onIcon="pi pi-code"
          offIcon="pi pi-list"
          size="small"
        />
        <Message v-if="cleanError" severity="error" :closable="false" size="small">
          {{ cleanError }}
        </Message>
      </div>
      <div :class="{ 'result-area': true, stale: cleanLoading && cleanResult }">
        <RawJsonView v-if="cleanResult && showRaw.clean" :data="cleanResult" />
        <CleanReport v-else-if="cleanResult" :report="cleanResult" />
        <p v-else-if="!cleanLoading" class="no-results">Loading preview…</p>
      </div>
    </div>

    <div
      v-else-if="op === 'roundtrip'"
      class="panel-content"
      data-description="roundtrip result panel"
    >
      <p class="help">
        Export to format2 then re-import and compare — catches lossy transformations.
      </p>
      <div class="panel-toolbar">
        <Button
          :label="roundtripResult ? 'Re-run' : 'Run'"
          :icon="roundtripResult ? 'pi pi-refresh' : 'pi pi-play'"
          :text="!!roundtripResult"
          size="small"
          :loading="roundtripLoading"
          data-description="run roundtrip operation"
          @click="() => void runRoundtrip(roundtripOpts)"
        />
        <label class="opt-label">
          <Checkbox v-model="roundtripOpts.strict_structure" :binary="true" size="small" />
          Strict structure
        </label>
        <label class="opt-label">
          <Checkbox v-model="roundtripOpts.strict_encoding" :binary="true" size="small" />
          Strict encoding
        </label>
        <label class="opt-label" v-tooltip.top="'Compare runtime state, not just shape.'">
          <Checkbox v-model="roundtripOpts.strict_state" :binary="true" size="small" />
          Strict state
        </label>
        <ToggleButton
          v-if="roundtripResult"
          v-model="showRaw.roundtrip"
          onLabel="Raw JSON"
          offLabel="Formatted"
          onIcon="pi pi-code"
          offIcon="pi pi-list"
          size="small"
        />
        <Message v-if="roundtripError" severity="error" :closable="false" size="small">
          {{ roundtripError }}
        </Message>
      </div>
      <div :class="{ 'result-area': true, stale: roundtripLoading && roundtripResult }">
        <RawJsonView v-if="roundtripResult && showRaw.roundtrip" :data="roundtripResult" />
        <RoundtripReport v-else-if="roundtripResult" :report="roundtripResult" />
        <p v-else-if="!roundtripLoading" class="no-results">No results yet. Click Run.</p>
      </div>
    </div>

    <div v-else-if="op === 'convert'" class="panel-content" data-description="convert result panel">
      <p class="help destructive">
        <i class="pi pi-exclamation-triangle" />
        Preview of the format2 conversion. Clicking
        <strong>Convert &amp; delete original</strong> writes the new file and
        <strong>deletes</strong> the source at <code>{{ workflowPath }}</code
        >.
      </p>
      <div class="panel-toolbar">
        <Button
          label="Convert & delete original"
          icon="pi pi-exclamation-triangle"
          severity="danger"
          size="small"
          :loading="convertLoading"
          :disabled="!convertResult || convertLoading"
          data-description="apply convert operation"
          @click="() => void handleConvertApply()"
        />
        <ToggleButton
          v-if="convertResult"
          v-model="showRaw.convert"
          onLabel="Raw JSON"
          offLabel="Formatted"
          onIcon="pi pi-code"
          offIcon="pi pi-list"
          size="small"
        />
        <Message v-if="convertError" severity="error" :closable="false" size="small">
          {{ convertError }}
        </Message>
      </div>
      <div :class="{ 'result-area': true, stale: convertLoading && convertResult }">
        <RawJsonView v-if="convertResult && showRaw.convert" :data="convertResult" />
        <ExportReport v-else-if="convertResult" :result="convertResult" />
        <p v-else-if="!convertLoading" class="no-results">Loading preview…</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Select from "primevue/select";
import ToggleButton from "primevue/togglebutton";
import Message from "primevue/message";
import { useToast } from "primevue/usetoast";
import {
  ValidationReport,
  LintReport,
  CleanReport,
  RoundtripReport,
  ExportReport,
  RawJsonView,
} from "@galaxy-tool-util/gxwf-report-shell";
import { useRouter } from "vue-router";
import {
  useOperation,
  invalidateStaleOps,
  type OperationName,
  type ValidateOpts,
  type LintOpts,
  type CleanOpts,
  type RoundtripOpts,
  type ExportOpts,
  type ConvertOpts,
} from "../composables/useOperation";
import { useWorkflows } from "../composables/useWorkflows";

const props = defineProps<{
  workflowPath: string;
  op: OperationName;
}>();

const {
  validateResult,
  lintResult,
  cleanResult,
  roundtripResult,
  exportResult,
  convertResult,
  validateLoading,
  lintLoading,
  cleanLoading,
  roundtripLoading,
  exportLoading,
  convertLoading,
  validateError,
  lintError,
  cleanError,
  roundtripError,
  exportError,
  convertError,
  runValidate,
  runLint,
  runClean,
  runRoundtrip,
  runExport,
  runConvert,
} = useOperation(props.workflowPath);

const { refreshWorkflows } = useWorkflows();
const router = useRouter();
const toast = useToast();

const modeOptions = [
  { label: "Meta model", value: "effect" },
  { label: "JSON Schema", value: "json-schema" },
];

const validateOpts = reactive<ValidateOpts>({
  strict_structure: false,
  strict_encoding: false,
  mode: "effect",
  clean_first: false,
});

const lintOpts = reactive<LintOpts>({
  strict_structure: false,
  strict_encoding: false,
});

const roundtripOpts = reactive<RoundtripOpts>({
  strict_structure: false,
  strict_encoding: false,
  strict_state: false,
});

const showRaw = reactive({
  validate: false,
  lint: false,
  clean: false,
  roundtrip: false,
  export: false,
  convert: false,
});

// Debounce option-change reruns so toggling multiple checkboxes doesn't fire a flurry.
const RERUN_DEBOUNCE_MS = 250;
function debounced(fn: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, RERUN_DEBOUNCE_MS);
  };
}

function autoRunForCurrentOp() {
  switch (props.op) {
    case "validate":
      if (!validateResult.value) void runValidate(validateOpts);
      break;
    case "lint":
      if (!lintResult.value) void runLint(lintOpts);
      break;
    case "clean":
      if (!cleanResult.value) void runClean({ dry_run: true });
      break;
    case "export":
      if (!exportResult.value) void runExport({ dry_run: true });
      break;
    case "convert":
      if (!convertResult.value) void runConvert({ dry_run: true });
      break;
    // roundtrip: no auto-run — expensive, keep it explicit.
  }
}

onMounted(autoRunForCurrentOp);
watch(() => props.op, autoRunForCurrentOp);

// Reactive recompute on option change. Always-on for validate/lint (cheap reads);
// refresh-only (if a prior result exists) for roundtrip.
watch(
  validateOpts,
  debounced(() => {
    if (props.op === "validate") void runValidate(validateOpts);
  }),
);
watch(
  lintOpts,
  debounced(() => {
    if (props.op === "lint") void runLint(lintOpts);
  }),
);
watch(
  roundtripOpts,
  debounced(() => {
    if (props.op === "roundtrip" && roundtripResult.value) void runRoundtrip(roundtripOpts);
  }),
);

async function handleCleanApply() {
  await runClean({ dry_run: false });
  if (!cleanError.value) {
    invalidateStaleOps(props.workflowPath, "clean");
    await refreshWorkflows();
    toast.add({
      severity: "success",
      summary: "Clean applied",
      detail: `Rewrote ${props.workflowPath}`,
      life: 3000,
    });
  }
}

async function handleExportApply() {
  await runExport({ dry_run: false });
  if (!exportError.value) {
    await refreshWorkflows();
    toast.add({
      severity: "success",
      summary: "Sibling written",
      detail: exportResult.value?.output_path ?? "Wrote format2 sibling",
      life: 3000,
    });
  }
}

async function handleConvertApply() {
  const confirmed = window.confirm(
    `Convert will delete the original file at ${props.workflowPath} after writing the converted output. Continue?`,
  );
  if (!confirmed) return;
  await runConvert({ dry_run: false });
  if (!convertError.value) {
    await refreshWorkflows();
    toast.add({
      severity: "success",
      summary: "Converted",
      detail: `Replaced ${props.workflowPath}`,
      life: 3000,
    });
    void router.push("/");
  }
}
</script>

<style scoped>
.op-panel {
  display: contents;
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: var(--gx-sp-3);
}

.help {
  margin: 0;
  font-size: var(--gx-fs-sm);
  color: var(--p-text-color-secondary, #6c757d);
  line-height: 1.4;
}

.help.destructive {
  color: var(--p-red-500, #e24c4c);
  display: flex;
  align-items: center;
  gap: var(--gx-sp-2);
  flex-wrap: wrap;
}

.help code {
  font-family: var(--gx-font-mono, monospace);
  font-size: 0.9em;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: var(--gx-sp-3);
  flex-wrap: wrap;
}

.mode-select {
  width: 9rem;
}

.opt-label {
  display: flex;
  align-items: center;
  gap: var(--gx-sp-2);
  font-size: var(--gx-fs-sm);
  cursor: pointer;
  white-space: nowrap;
}

.result-area {
  transition: opacity 120ms ease;
}

.result-area.stale {
  opacity: 0.55;
  pointer-events: none;
}

.no-results {
  margin: 0;
  color: var(--p-text-color-secondary, #6c757d);
  font-style: italic;
}
</style>
