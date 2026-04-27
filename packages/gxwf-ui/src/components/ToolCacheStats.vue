<template>
  <div class="cache-stats" data-description="tool cache stats">
    <div class="stat-line">
      <strong>{{ stats.count }}</strong> tools
      <template v-if="stats.totalBytes !== undefined">
        · <strong>{{ formatBytes(stats.totalBytes) }}</strong>
      </template>
      <template v-for="(n, source) in stats.bySource" :key="source">
        · <strong>{{ n }}</strong> {{ source }}
      </template>
    </div>
    <div v-if="stats.oldest || stats.newest" class="stat-line stat-meta">
      <span v-if="stats.oldest">Oldest: {{ formatDate(stats.oldest) }}</span>
      <span v-if="stats.newest">Newest: {{ formatDate(stats.newest) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { components } from "@galaxy-tool-util/gxwf-client";

defineProps<{ stats: components["schemas"]["CacheStats"] }>();

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
</script>

<style scoped>
.cache-stats {
  padding: var(--gx-sp-3) var(--gx-sp-4);
  background: var(--p-content-background, #fff);
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 6px;
  margin-bottom: var(--gx-sp-4);
}

.stat-line {
  font-size: var(--gx-fs-sm);
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
  align-items: baseline;
}

.stat-meta {
  margin-top: var(--gx-sp-2);
  gap: var(--gx-sp-4);
  color: var(--p-text-muted-color, #6b7280);
  font-size: var(--gx-fs-xs);
}
</style>
