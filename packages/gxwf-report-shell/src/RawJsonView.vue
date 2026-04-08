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
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #d4d4d4;
  white-space: pre;
  max-height: 70vh;
}
</style>
