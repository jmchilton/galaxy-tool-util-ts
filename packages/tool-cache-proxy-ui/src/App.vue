<template>
  <div class="app-shell">
    <header class="app-header">
      <span class="brand-logo">galaxy-tool-proxy</span>
      <span class="brand-sub">Tool Cache</span>
    </header>
    <main class="app-main">
      <ToolCacheView :client="client" />
    </main>
    <Toast position="bottom-right" />
  </div>
</template>

<script setup lang="ts">
import Toast from "primevue/toast";
import { ToolCacheView, createCacheClient } from "@galaxy-tool-util/cache-ui";

// Same-origin: in dev, Vite proxies /api to the running proxy server
// (default http://localhost:8080, override via GALAXY_TOOL_PROXY_URL).
const client = createCacheClient(import.meta.env.VITE_API_BASE_URL ?? "");
</script>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  background: #f5f5f6;
  color: #1f2937;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  height: 48px;
  padding: 0 1.5rem;
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  background: #1f2937;
  color: #fff;
}

.brand-logo {
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.brand-sub {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}

.app-main {
  flex: 1;
  padding: 1.5rem;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}
</style>
