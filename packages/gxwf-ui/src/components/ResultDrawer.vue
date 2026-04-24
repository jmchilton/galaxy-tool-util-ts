<template>
  <section
    class="result-drawer"
    :data-description="`${op} drawer`"
    role="region"
    :aria-label="title"
  >
    <header class="drawer-header">
      <h2><i :class="icon" /> {{ title }}</h2>
      <Button
        icon="pi pi-times"
        text
        rounded
        size="small"
        aria-label="Close"
        data-description="close drawer"
        v-tooltip.left="'Close'"
        @click="$emit('close')"
      />
    </header>
    <div class="drawer-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import type { OperationName } from "../composables/useOperation";

const props = defineProps<{ op: OperationName }>();
defineEmits<{ (e: "close"): void }>();

const META: Record<OperationName, { label: string; icon: string }> = {
  validate: { label: "Validate", icon: "pi pi-check-circle" },
  lint: { label: "Lint", icon: "pi pi-search" },
  clean: { label: "Clean", icon: "pi pi-sparkles" },
  roundtrip: { label: "Roundtrip", icon: "pi pi-refresh" },
  export: { label: "Export", icon: "pi pi-download" },
  convert: { label: "Convert", icon: "pi pi-arrow-right-arrow-left" },
};

const title = computed(() => META[props.op].label);
const icon = computed(() => META[props.op].icon);
</script>

<style scoped>
.result-drawer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.1));
  border-radius: 4px;
  background: var(--p-content-background, transparent);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gx-sp-3);
  padding: var(--gx-sp-2) var(--gx-sp-3);
  border-bottom: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.1));
}

.drawer-header h2 {
  margin: 0;
  font-size: var(--gx-fs-base);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--gx-sp-2);
}

.drawer-body {
  padding: var(--gx-sp-3);
  overflow: auto;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
