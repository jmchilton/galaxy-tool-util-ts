<template>
  <Tabs value="validate">
    <TabList>
      <Tab value="validate">Validate</Tab>
      <Tab value="lint">Lint</Tab>
      <Tab value="clean">Clean</Tab>
      <Tab value="roundtrip">Roundtrip</Tab>
    </TabList>
    <TabPanels>
      <TabPanel value="validate">
        <div class="panel-content">
          <div class="panel-toolbar">
            <Button
              label="Run"
              icon="pi pi-play"
              size="small"
              :loading="validateLoading"
              @click="() => void runValidate()"
            />
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

      <TabPanel value="lint">
        <div class="panel-content">
          <div class="panel-toolbar">
            <Button
              label="Run"
              icon="pi pi-play"
              size="small"
              :loading="lintLoading"
              @click="() => void runLint()"
            />
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

      <TabPanel value="clean">
        <div class="panel-content">
          <div class="panel-toolbar">
            <Button
              label="Run"
              icon="pi pi-play"
              size="small"
              :loading="cleanLoading"
              @click="() => void runClean()"
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
          <RawJsonView v-if="cleanResult && showRaw.clean" :data="cleanResult" />
          <CleanReport v-else-if="cleanResult" :report="cleanResult" />
          <p v-else-if="!cleanLoading" class="no-results">No results yet. Click Run.</p>
        </div>
      </TabPanel>

      <TabPanel value="roundtrip">
        <div class="panel-content">
          <div class="panel-toolbar">
            <Button
              label="Run"
              icon="pi pi-play"
              size="small"
              :loading="roundtripLoading"
              @click="() => void runRoundtrip()"
            />
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
    </TabPanels>
  </Tabs>
</template>

<script setup lang="ts">
import { reactive } from "vue";
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";
import Button from "primevue/button";
import ToggleButton from "primevue/togglebutton";
import Message from "primevue/message";
import {
  ValidationReport,
  LintReport,
  CleanReport,
  RoundtripReport,
  RawJsonView,
} from "@galaxy-tool-util/gxwf-report-shell";
import { useOperation } from "../composables/useOperation";

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
  validateLoading,
  lintLoading,
  cleanLoading,
  roundtripLoading,
  validateError,
  lintError,
  cleanError,
  roundtripError,
  runValidate,
  runLint,
  runClean,
  runRoundtrip,
} = useOperation(props.workflowPath);

const showRaw = reactive({ validate: false, lint: false, clean: false, roundtrip: false });
</script>

<style scoped>
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
}

.no-results {
  margin: 0;
  color: var(--p-text-color-secondary, #6c757d);
  font-style: italic;
}
</style>
