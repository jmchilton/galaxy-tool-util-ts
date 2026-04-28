/**
 * @module @galaxy-tool-util/cache-ui
 *
 * Vue 3 + PrimeVue components and composable for inspecting and managing the
 * Galaxy tool cache exposed by `gxwf-web` and `tool-cache-proxy`. Both servers
 * implement the same cache HTTP surface; pass a `createCacheClient(baseUrl)`
 * to the components and they work against either.
 */

export { default as ToolCacheView } from "./views/ToolCacheView.vue";
export { default as ToolCacheTable } from "./components/ToolCacheTable.vue";
export { default as ToolCacheStats } from "./components/ToolCacheStats.vue";
export { default as ToolCacheRawDialog } from "./components/ToolCacheRawDialog.vue";
export { useToolCache } from "./composables/useToolCache.js";
export { createCacheClient } from "./client.js";
export type { CacheClient, CachedToolEntry, CacheStats } from "./client.js";
