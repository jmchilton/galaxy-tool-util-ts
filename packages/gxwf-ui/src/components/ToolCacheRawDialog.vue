<template>
  <Dialog
    v-model:visible="visible"
    :header="entry?.toolId ?? 'Cached payload'"
    modal
    :style="{ width: '70vw' }"
    :breakpoints="{ '960px': '90vw' }"
  >
    <div v-if="loading" class="loading-state">Loading…</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>
    <pre v-else class="raw-json">{{ pretty }}</pre>
    <template #footer>
      <Button label="Copy" icon="pi pi-copy" text :disabled="!pretty" @click="copy" />
      <Button label="Close" icon="pi pi-times" @click="visible = false" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { useToast } from "primevue/usetoast";
import type { components } from "@galaxy-tool-util/gxwf-client";

type Entry = components["schemas"]["CachedToolEntry"];

const props = defineProps<{
  modelValue: boolean;
  entry: Entry | null;
  load: (cacheKey: string) => Promise<{ contents: unknown; decodable: boolean } | undefined>;
}>();
const emit = defineEmits<{ "update:modelValue": [v: boolean] }>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const toast = useToast();
const contents = ref<unknown>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const pretty = computed(() =>
  contents.value !== null ? JSON.stringify(contents.value, null, 2) : "",
);

watch(
  () => [props.modelValue, props.entry?.cacheKey],
  async ([open, key]) => {
    if (!open || !key) return;
    loading.value = true;
    error.value = null;
    contents.value = null;
    try {
      const data = await props.load(key as string);
      contents.value = data?.contents ?? null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  },
);

async function copy() {
  await navigator.clipboard.writeText(pretty.value);
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
