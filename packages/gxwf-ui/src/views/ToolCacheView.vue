<template>
  <ToolCacheView :client="client" />
</template>

<script setup lang="ts">
import { ToolCacheView, createCacheClient } from "@galaxy-tool-util/cache-ui";

// In development, Vite proxies /api to the backend (localhost:8000). In
// production, serve from the same origin as the API.
const client = createCacheClient(import.meta.env.VITE_API_BASE_URL ?? "");
</script>
