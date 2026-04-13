<template>
  <div class="tabs-frame">
    <Tabs value="validate">
      <TabList>
        <Tab value="validate" data-description="validate tab">Validate</Tab>
        <Tab value="lint" data-description="lint tab">Lint</Tab>
        <Tab value="clean" data-description="clean tab">Clean</Tab>
        <Tab value="roundtrip" data-description="roundtrip tab">Roundtrip</Tab>
        <Tab value="export" data-description="export tab">Export</Tab>
        <Tab value="convert" data-description="convert tab">Convert</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="validate" data-description="validate panel">
          <div class="panel-content" data-description="validate result panel">
            <div class="panel-toolbar">
              <Button
                label="Run"
                icon="pi pi-play"
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
              />
              <label class="opt-label">
                <Checkbox v-model="validateOpts.strict_structure" :binary="true" size="small" />
                Strict structure
              </label>
              <label class="opt-label">
                <Checkbox v-model="validateOpts.strict_encoding" :binary="true" size="small" />
                Strict encoding
              </label>
              <label class="opt-label">
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
            <RawJsonView v-if="validateResult && showRaw.validate" :data="validateResult" />
            <ValidationReport v-else-if="validateResult" :report="validateResult" />
            <p v-else-if="!validateLoading" class="no-results">No results yet. Click Run.</p>
          </div>
        </TabPanel>

        <TabPanel value="lint" data-description="lint panel">
          <div class="panel-content" data-description="lint result panel">
            <div class="panel-toolbar">
              <Button
                label="Run"
                icon="pi pi-play"
                size="small"
                :loading="lintLoading"
                data-description="run lint operation"
                @click="() => void runLint(lintOpts)"
              />
              <label class="opt-label">
                <Checkbox v-model="lintOpts.strict_structure" :binary="true" size="small" />
                Strict structure
              </label>
              <label class="opt-label">
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
            <RawJsonView v-if="lintResult && showRaw.lint" :data="lintResult" />
            <LintReport v-else-if="lintResult" :report="lintResult" />
            <p v-else-if="!lintLoading" class="no-results">No results yet. Click Run.</p>
          </div>
        </TabPanel>

        <TabPanel value="clean" data-description="clean panel">
          <div class="panel-content" data-description="clean result panel">
            <div class="panel-toolbar">
              <Button
                label="Run"
                icon="pi pi-play"
                size="small"
                :loading="cleanLoading"
                data-description="run clean operation"
                @click="() => void handleClean()"
              />
              <label class="opt-label" data-description="clean dry-run toggle">
                <Checkbox v-model="cleanOpts.dry_run" :binary="true" size="small" />
                Dry run
              </label>
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
            <RawJsonView v-if="cleanResult && showRaw.clean" :data="cleanResult" />
            <CleanReport v-else-if="cleanResult" :report="cleanResult" />
            <p v-else-if="!cleanLoading" class="no-results">No results yet. Click Run.</p>
          </div>
        </TabPanel>

        <TabPanel value="roundtrip" data-description="roundtrip panel">
          <div class="panel-content" data-description="roundtrip result panel">
            <div class="panel-toolbar">
              <Button
                label="Run"
                icon="pi pi-play"
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
              <label class="opt-label">
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
            <RawJsonView v-if="roundtripResult && showRaw.roundtrip" :data="roundtripResult" />
            <RoundtripReport v-else-if="roundtripResult" :report="roundtripResult" />
            <p v-else-if="!roundtripLoading" class="no-results">No results yet. Click Run.</p>
          </div>
        </TabPanel>

        <TabPanel value="export" data-description="export panel">
          <div class="panel-content" data-description="export result panel">
            <div class="panel-toolbar">
              <Button
                label="Run"
                icon="pi pi-play"
                size="small"
                :loading="exportLoading"
                data-description="run export operation"
                @click="() => void handleExport()"
              />
              <label class="opt-label" data-description="export dry-run toggle">
                <Checkbox v-model="exportOpts.dry_run" :binary="true" size="small" />
                Dry run
              </label>
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
            <RawJsonView v-if="exportResult && showRaw.export" :data="exportResult" />
            <ExportReport v-else-if="exportResult" :result="exportResult" />
            <p v-else-if="!exportLoading" class="no-results">No results yet. Click Run.</p>
          </div>
        </TabPanel>

        <TabPanel value="convert" data-description="convert panel">
          <div class="panel-content" data-description="convert result panel">
            <div class="panel-toolbar">
              <Button
                label="Run"
                icon="pi pi-play"
                severity="danger"
                size="small"
                :loading="convertLoading"
                data-description="run convert operation"
                @click="() => void handleConvert()"
              />
              <label class="opt-label" data-description="convert dry-run toggle">
                <Checkbox v-model="convertOpts.dry_run" :binary="true" size="small" />
                Dry run
              </label>
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
            <Message
              v-if="!convertOpts.dry_run"
              severity="warn"
              :closable="false"
              size="small"
              class="convert-warning"
            >
              Convert writes the new file and deletes the original. Enable Dry run to preview.
            </Message>
            <RawJsonView v-if="convertResult && showRaw.convert" :data="convertResult" />
            <ExportReport v-else-if="convertResult" :result="convertResult" />
            <p v-else-if="!convertLoading" class="no-results">No results yet. Click Run.</p>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { reactive } from "vue";
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Select from "primevue/select";
import ToggleButton from "primevue/togglebutton";
import Message from "primevue/message";
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
}>();

// workflowPath is captured at setup time. This is safe because WorkflowView is
// destroyed and recreated on route changes — OperationPanel is never reused for
// a different path within the same component instance lifetime.
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

const cleanOpts = reactive<CleanOpts>({ dry_run: false });

const roundtripOpts = reactive<RoundtripOpts>({
  strict_structure: false,
  strict_encoding: false,
  strict_state: false,
});

const exportOpts = reactive<ExportOpts>({ dry_run: false });
const convertOpts = reactive<ConvertOpts>({ dry_run: false });

const showRaw = reactive({
  validate: false,
  lint: false,
  clean: false,
  roundtrip: false,
  export: false,
  convert: false,
});

async function handleClean() {
  await runClean(cleanOpts);
  if (!cleanOpts.dry_run && !cleanError.value) {
    invalidateStaleOps(props.workflowPath, "clean");
    await refreshWorkflows();
  }
}

async function handleExport() {
  await runExport(exportOpts);
  if (!exportOpts.dry_run && !exportError.value) {
    // Source file is unchanged on export; new file appeared alongside.
    await refreshWorkflows();
  }
}

async function handleConvert() {
  if (!convertOpts.dry_run) {
    const confirmed = window.confirm(
      `Convert will delete the original file at ${props.workflowPath} after writing the converted output. Continue?`,
    );
    if (!confirmed) return;
  }
  await runConvert(convertOpts);
  if (!convertOpts.dry_run && !convertError.value) {
    // Original path is gone — refresh list and navigate back to dashboard.
    await refreshWorkflows();
    void router.push("/");
  }
}
</script>

<style scoped>
.tabs-frame {
  border: 1px solid var(--gx-gold, #d0bd2a);
  border-radius: 6px;
  overflow: hidden;
}

.panel-content {
  padding: 1rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.mode-select {
  width: 9rem;
}

.opt-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}

.convert-warning {
  align-self: flex-start;
}

.no-results {
  margin: 0;
  color: var(--p-text-color-secondary, #6c757d);
  font-style: italic;
}
</style>
