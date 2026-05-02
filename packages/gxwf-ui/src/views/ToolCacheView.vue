<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Tool Cache</h1>
        <p class="subtitle">
          Inspect and manage parsed-tool caches. The server-side cache lives on disk inside
          <code>gxwf-web</code>; the client-side cache is browser-local IndexedDB used by the client
          edge-annotations transport.
        </p>
      </div>
      <div class="header-actions">
        <SelectButton
          v-model="transport"
          :options="transportOptions"
          optionLabel="label"
          optionValue="value"
          :allowEmpty="false"
          aria-label="Cache transport"
        />
      </div>
    </div>

    <ToolCachePanel v-if="transport === 'server' || transport === 'both'" transport="server" />
    <ToolCachePanel v-if="transport === 'client' || transport === 'both'" transport="client" />

    <ConfirmDialog />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import ConfirmDialog from "primevue/confirmdialog";
import SelectButton from "primevue/selectbutton";

import ToolCachePanel from "../components/ToolCachePanel.vue";

type Transport = "server" | "client" | "both";

const STORAGE_KEY = "gxwf-ui:cache-transport";

function readStored(): Transport {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "server" || v === "client" || v === "both") return v;
  } catch {
    // ignore
  }
  return "server";
}

const transport = ref<Transport>(readStored());

watch(transport, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore
  }
});

const transportOptions = [
  { label: "Server", value: "server" },
  { label: "Client", value: "client" },
  { label: "Both", value: "both" },
];
</script>

<style scoped>
.view-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--gx-sp-4);
  margin-bottom: var(--gx-sp-4);
}

.view-header h1 {
  margin: 0 0 var(--gx-sp-1);
  font-size: var(--gx-fs-xl);
}

.subtitle {
  margin: 0;
  color: var(--p-text-muted-color, #6b7280);
  font-size: var(--gx-fs-sm);
  max-width: 56ch;
}

.subtitle code {
  font-family: var(--gx-mono);
  font-size: 0.95em;
}

.header-actions {
  display: flex;
  gap: var(--gx-sp-2);
  align-items: center;
}
</style>
