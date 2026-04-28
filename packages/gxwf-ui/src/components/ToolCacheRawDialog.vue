<template>
  <Dialog
    v-model:visible="visible"
    :header="entry?.toolId ?? 'Cached payload'"
    modal
    :style="{ width: '70vw' }"
    :breakpoints="{ '960px': '90vw' }"
  >
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab v-for="t in TABS" :key="t.id" :value="t.id" :disabled="t.disabled">
          {{ t.label }}
        </Tab>
      </TabList>
      <TabPanels>
        <TabPanel v-for="t in TABS" :key="t.id" :value="t.id">
          <div v-if="t.disabled" class="loading-state">
            Not yet available — tool source isn't stored in the cache.
          </div>
          <div v-else-if="loading[t.id]" class="loading-state">Loading…</div>
          <div v-else-if="errors[t.id]" class="error-state">{{ errors[t.id] }}</div>
          <pre v-else class="raw-json">{{ pretty(t.id) }}</pre>
        </TabPanel>
      </TabPanels>
    </Tabs>
    <template #footer>
      <Button label="Copy" icon="pi pi-copy" text :disabled="!activePretty" @click="copy" />
      <Button label="Close" icon="pi pi-times" @click="visible = false" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";
import { useToast } from "primevue/usetoast";
import type { components } from "@galaxy-tool-util/gxwf-client";

type Entry = components["schemas"]["CachedToolEntry"];
type TabId =
  | "parameter_model"
  | "parameter_request_schema"
  | "parameter_landing_request_schema"
  | "parameter_test_case_xml_schema"
  | "tool_source";

interface Loaders {
  parameter_model: (toolId: string, toolVersion: string) => Promise<unknown>;
  parameter_request_schema: (toolId: string, toolVersion: string) => Promise<unknown>;
  parameter_landing_request_schema: (toolId: string, toolVersion: string) => Promise<unknown>;
  parameter_test_case_xml_schema: (toolId: string, toolVersion: string) => Promise<unknown>;
}

const props = defineProps<{
  modelValue: boolean;
  entry: Entry | null;
  loaders: Loaders;
}>();
const emit = defineEmits<{ "update:modelValue": [v: boolean] }>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const TABS: { id: TabId; label: string; disabled?: boolean }[] = [
  { id: "parameter_model", label: "Model" },
  { id: "parameter_request_schema", label: "Request schema" },
  { id: "parameter_landing_request_schema", label: "Landing-request schema" },
  { id: "parameter_test_case_xml_schema", label: "Test-case schema" },
  { id: "tool_source", label: "Source", disabled: true },
];

const toast = useToast();
const activeTab = ref<TabId>("parameter_model");
const contents = reactive<Record<TabId, unknown>>({
  parameter_model: null,
  parameter_request_schema: null,
  parameter_landing_request_schema: null,
  parameter_test_case_xml_schema: null,
  tool_source: null,
});
const loading = reactive<Record<TabId, boolean>>({
  parameter_model: false,
  parameter_request_schema: false,
  parameter_landing_request_schema: false,
  parameter_test_case_xml_schema: false,
  tool_source: false,
});
const errors = reactive<Record<TabId, string | null>>({
  parameter_model: null,
  parameter_request_schema: null,
  parameter_landing_request_schema: null,
  parameter_test_case_xml_schema: null,
  tool_source: null,
});
const fetched = reactive<Record<TabId, boolean>>({
  parameter_model: false,
  parameter_request_schema: false,
  parameter_landing_request_schema: false,
  parameter_test_case_xml_schema: false,
  tool_source: true, // never fetched until source storage lands
});

function pretty(id: TabId): string {
  const v = contents[id];
  return v === null || v === undefined ? "" : JSON.stringify(v, null, 2);
}
const activePretty = computed(() => pretty(activeTab.value));

async function loadTab(id: TabId): Promise<void> {
  if (id === "tool_source") return;
  if (fetched[id]) return;
  if (!props.entry) return;
  loading[id] = true;
  errors[id] = null;
  try {
    const loader = props.loaders[id];
    contents[id] = await loader(props.entry.toolId, props.entry.toolVersion);
    fetched[id] = true;
  } catch (e) {
    errors[id] = e instanceof Error ? e.message : String(e);
  } finally {
    loading[id] = false;
  }
}

watch(
  () => [props.modelValue, props.entry?.cacheKey],
  ([open]) => {
    if (!open) return;
    // Reset per-entry state when a new entry is shown.
    for (const t of TABS) {
      contents[t.id] = null;
      errors[t.id] = null;
      fetched[t.id] = t.id === "tool_source";
    }
    activeTab.value = "parameter_model";
    void loadTab("parameter_model");
  },
);

watch(activeTab, (id) => {
  void loadTab(id);
});

async function copy() {
  await navigator.clipboard.writeText(activePretty.value);
  toast.add({ severity: "success", summary: "Copied", life: 1500 });
}
</script>

<style scoped>
.raw-json {
  max-height: 60vh;
  overflow: auto;
  margin: 0;
  padding: var(--gx-sp-3);
  background: var(--p-surface-100, #f3f4f6);
  border-radius: 4px;
  font-family: var(--gx-mono);
  font-size: var(--gx-fs-xs);
  white-space: pre;
}

.loading-state,
.error-state {
  padding: var(--gx-sp-4);
  text-align: center;
}

.error-state {
  color: var(--p-red-500, #ef4444);
}
</style>
