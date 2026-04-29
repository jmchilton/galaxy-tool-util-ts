<template>
  <section class="cache-panel">
    <div class="panel-header">
      <h2>{{ title }}</h2>
      <div class="panel-actions">
        <label
          class="decode-toggle"
          v-tooltip.bottom="'Probe each entry for decode-ability (slower)'"
        >
          <Checkbox v-model="decodeProbe" :binary="true" @change="reload" />
          <span>Decode probe</span>
        </label>
        <Button label="Refresh" icon="pi pi-refresh" text :loading="loading" @click="reload" />
        <Button
          icon="pi pi-ellipsis-v"
          text
          aria-label="Cache actions"
          @click="(e) => menu?.toggle(e)"
        />
        <Menu ref="menu" :model="menuItems" :popup="true" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <ToolCacheStats :stats="stats" />

    <ToolCacheTable
      :entries="entries"
      :loading="loading"
      @view="viewEntry"
      @refetch="refetchEntry"
      @delete="confirmDelete"
    />

    <ToolCacheRawDialog v-model="rawOpen" :entry="rawEntry" :load="loadRaw" />

    <Dialog
      v-model:visible="addOpen"
      :header="`Add tool to ${transport} cache`"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="add-form">
        <label>
          <span>Tool ID</span>
          <InputText
            v-model="addToolId"
            placeholder="toolshed.g2.../repos/owner/repo/tool/version"
          />
        </label>
        <label>
          <span>Version (optional)</span>
          <InputText v-model="addToolVersion" />
        </label>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="addOpen = false" />
        <Button label="Add" icon="pi pi-plus" :loading="addPending" @click="doAdd" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="prefixOpen"
      header="Clear by tool-id prefix"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="add-form">
        <label>
          <span>Tool ID prefix</span>
          <InputText v-model="prefixValue" placeholder="e.g. toolshed.g2.bx.psu.edu/repos/iuc/" />
        </label>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="prefixOpen = false" />
        <Button
          label="Clear"
          icon="pi pi-trash"
          severity="danger"
          :loading="clearPending"
          @click="doClearPrefix"
        />
      </template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import Message from "primevue/message";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";

import ToolCacheStats from "./ToolCacheStats.vue";
import ToolCacheTable from "./ToolCacheTable.vue";
import ToolCacheRawDialog from "./ToolCacheRawDialog.vue";
import { useToolCache } from "../composables/useToolCache";
import { useClientToolCache } from "../composables/useClientToolCache";
import type { components } from "@galaxy-tool-util/gxwf-client";

type Entry = components["schemas"]["CachedToolEntry"];

const props = defineProps<{ transport: "server" | "client" }>();

const title = computed(() =>
  props.transport === "server" ? "Server-side cache" : "Client-side cache (IndexedDB)",
);

// Same destructured surface across both backends — that's the whole point of
// `useClientToolCache` mirroring `useToolCache`.
const { entries, stats, loading, error, refresh, loadRaw, del, clear, refetch, add } =
  props.transport === "server" ? useToolCache() : useClientToolCache();

const toast = useToast();
const confirm = useConfirm();

const menu = ref<InstanceType<typeof Menu> | null>(null);
const rawOpen = ref(false);
const rawEntry = ref<Entry | null>(null);
const decodeProbe = ref(false);

function reload() {
  void refresh({ decode: decodeProbe.value });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const addOpen = ref(false);
const addToolId = ref("");
const addToolVersion = ref("");
const addPending = ref(false);

const prefixOpen = ref(false);
const prefixValue = ref("");
const clearPending = ref(false);

const menuItems = [
  { label: "Add tool…", icon: "pi pi-plus", command: () => (addOpen.value = true) },
  {
    label: "Clear by prefix…",
    icon: "pi pi-filter-slash",
    command: () => (prefixOpen.value = true),
  },
  { separator: true },
  {
    label: "Clear all",
    icon: "pi pi-trash",
    command: () => {
      confirm.require({
        message: `Remove all ${stats.value.count} cached tools?`,
        header: "Clear cache",
        icon: "pi pi-exclamation-triangle",
        acceptProps: { severity: "danger", label: "Clear all" },
        accept: async () => {
          try {
            const data = await clear();
            toast.add({
              severity: "success",
              summary: `Removed ${data?.removed ?? 0} entries`,
              life: 2500,
            });
          } catch (e) {
            toast.add({ severity: "error", summary: errMsg(e), life: 4000 });
          }
        },
      });
    },
  },
];

function viewEntry(e: Entry) {
  rawEntry.value = e;
  rawOpen.value = true;
}

function confirmDelete(e: Entry) {
  confirm.require({
    message: `Delete cached entry for ${e.toolId} ${e.toolVersion}?`,
    header: "Delete entry",
    icon: "pi pi-exclamation-triangle",
    acceptProps: { severity: "danger", label: "Delete" },
    accept: async () => {
      try {
        await del(e.cacheKey);
        toast.add({ severity: "success", summary: `Deleted ${e.toolId}`, life: 2000 });
      } catch (err) {
        toast.add({ severity: "error", summary: errMsg(err), life: 4000 });
      }
    },
  });
}

async function refetchEntry(e: Entry) {
  try {
    await refetch(e.toolId, e.toolVersion);
    toast.add({
      severity: "success",
      summary: `Re-fetched ${e.toolId} ${e.toolVersion}`,
      life: 2500,
    });
  } catch (err) {
    toast.add({ severity: "error", summary: `Failed: ${errMsg(err)}`, life: 4000 });
  }
}

async function doAdd() {
  if (!addToolId.value) return;
  addPending.value = true;
  try {
    const data = await add(addToolId.value, addToolVersion.value || undefined);
    toast.add({
      severity: "success",
      summary: data?.alreadyCached ? "Already cached" : `Added ${addToolId.value}`,
      life: 2500,
    });
    addOpen.value = false;
    addToolId.value = "";
    addToolVersion.value = "";
  } catch (err) {
    toast.add({ severity: "error", summary: `Failed: ${errMsg(err)}`, life: 4000 });
  } finally {
    addPending.value = false;
  }
}

async function doClearPrefix() {
  if (!prefixValue.value) return;
  clearPending.value = true;
  try {
    const data = await clear(prefixValue.value);
    toast.add({
      severity: "success",
      summary: `Removed ${data?.removed ?? 0} entries`,
      life: 2500,
    });
    prefixOpen.value = false;
    prefixValue.value = "";
  } catch (err) {
    toast.add({ severity: "error", summary: errMsg(err), life: 4000 });
  } finally {
    clearPending.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.cache-panel + .cache-panel {
  margin-top: var(--gx-sp-6);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gx-sp-4);
  margin-bottom: var(--gx-sp-3);
}

.panel-header h2 {
  margin: 0;
  font-size: var(--gx-fs-lg);
}

.panel-actions {
  display: flex;
  gap: var(--gx-sp-2);
  align-items: center;
}

.decode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  font-size: var(--gx-fs-sm);
  color: var(--p-text-muted-color, #6b7280);
  cursor: pointer;
}

.add-form {
  display: flex;
  flex-direction: column;
  gap: var(--gx-sp-3);
}

.add-form label {
  display: flex;
  flex-direction: column;
  gap: 0.3em;
  font-size: var(--gx-fs-sm);
}
</style>
