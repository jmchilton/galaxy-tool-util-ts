<template>
  <div class="tool-strip" role="toolbar" aria-label="Workflow operations">
    <Button
      v-for="op in primaryOps"
      :key="op.value"
      :label="op.label"
      :icon="op.icon"
      :severity="activeOp === op.value ? 'primary' : 'secondary'"
      :text="activeOp !== op.value"
      size="small"
      :data-description="`tool strip ${op.value}`"
      @click="$emit('open-op', op.value)"
    />
    <Button
      type="button"
      icon="pi pi-ellipsis-h"
      text
      rounded
      size="small"
      aria-label="Advanced operations"
      data-description="advanced operations menu"
      class="advanced-trigger"
      v-tooltip.bottom="'Advanced operations'"
      @click="toggleAdvancedMenu"
    />
    <Menu
      ref="advancedMenuRef"
      :model="advancedMenuItems"
      :popup="true"
      data-description="advanced operations menu popup"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Button from "primevue/button";
import Menu from "primevue/menu";
import type { OperationName } from "../composables/useOperation";

defineProps<{ activeOp: OperationName | null }>();
const emit = defineEmits<{ (e: "open-op", op: OperationName): void }>();

const primaryOps: { value: OperationName; label: string; icon: string }[] = [
  { value: "clean", label: "Clean", icon: "pi pi-sparkles" },
  { value: "lint", label: "Lint", icon: "pi pi-search" },
  { value: "export", label: "Export", icon: "pi pi-download" },
];

const advancedOps: { value: OperationName; label: string; icon: string }[] = [
  { value: "validate", label: "Validate", icon: "pi pi-check-circle" },
  { value: "roundtrip", label: "Roundtrip", icon: "pi pi-refresh" },
  { value: "convert", label: "Convert", icon: "pi pi-arrow-right-arrow-left" },
];

const advancedMenuRef = ref<InstanceType<typeof Menu> | null>(null);

const advancedMenuItems = advancedOps.map((op) => ({
  label: op.label,
  icon: op.icon,
  command: () => emit("open-op", op.value),
}));

function toggleAdvancedMenu(event: Event) {
  advancedMenuRef.value?.toggle(event);
}
</script>

<style scoped>
.tool-strip {
  display: flex;
  align-items: center;
  gap: var(--gx-sp-2);
  padding: var(--gx-sp-2) 0;
  border-top: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.1));
  border-bottom: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.1));
}

.advanced-trigger {
  margin-left: auto;
}
</style>
