<template>
  <pre class="raw-json"><code>{{ formatted }}</code></pre>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ data: unknown }>();

const formatted = computed(() => JSON.stringify(props.data, null, 2));
</script>

<style scoped>
.raw-json {
  margin: 0;
  padding: 1rem;
  overflow: auto;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--p-text-color);
  white-space: pre;
  max-height: 70vh;
}
</style>
