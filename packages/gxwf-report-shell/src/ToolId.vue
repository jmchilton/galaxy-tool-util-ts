<template>
  <span :title="toolId ?? undefined" class="tool-id">{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { formatToolId } from "./toolId.js";

const props = defineProps<{ toolId: string | null }>();

const label = computed(() => formatToolId(props.toolId));
</script>

<style scoped>
.tool-id {
  font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;
  font-size: 0.85em;
}
</style>
