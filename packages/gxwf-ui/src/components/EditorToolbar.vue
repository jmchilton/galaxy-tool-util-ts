<script setup lang="ts">
// EditorToolbar — Monaco editor chrome for FileView. Buttons drive the live
// editor instance (undo/redo/format/find/palette) + surface LSP problems via
// a Badge. Save delegates to the parent's existing save handler so the
// toolbar button and ⌘S (Phase 6.2) share one code path.
//
// Disabled states are polled on model.onDidChangeContent (cheap; fires once
// per edit) rather than via separate events — monaco exposes no dedicated
// undo-stack-changed event.

import { computed, onBeforeUnmount, ref, watch } from "vue";
import type * as monaco from "monaco-editor";
import Button from "primevue/button";
import Badge from "primevue/badge";
import { useEditorMarkers } from "../composables/useEditorMarkers";
import { showCommandPalette } from "../editor/commandPalette";

const props = defineProps<{
  editor: monaco.editor.IStandaloneCodeEditor | null;
  model: monaco.editor.ITextModel | null;
  saving: boolean;
  onSave: () => void;
}>();

const editorRef = computed(() => props.editor);
const modelRef = computed(() => props.model);

const { errors, warnings, jumpToNext } = useEditorMarkers(editorRef, modelRef);

// Undo/redo availability — polled on content changes. Reset on every model
// swap so stale subs don't fire against a disposed model.
const canUndo = ref(false);
const canRedo = ref(false);
let contentSub: monaco.IDisposable | null = null;

function refreshUndoState() {
  const m = props.model;
  canUndo.value = m ? m.canUndo() : false;
  canRedo.value = m ? m.canRedo() : false;
}

watch(
  () => props.model,
  (next) => {
    contentSub?.dispose();
    contentSub = null;
    refreshUndoState();
    if (next) contentSub = next.onDidChangeContent(refreshUndoState);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  contentSub?.dispose();
  contentSub = null;
});

// `editor.action.formatDocument` exists in the editor's action registry as
// soon as Monaco boots, even without a formatting provider for the current
// language. `isSupported()` narrows to "there's an active provider" — the
// plan's guidance to hide the button when there's no formatter.
const formatSupported = computed(() => {
  const ed = props.editor;
  if (!ed) return false;
  const action = ed.getAction("editor.action.formatDocument");
  return !!action && action.isSupported();
});

function runSave() {
  props.onSave();
}

function runUndo() {
  props.editor?.trigger("toolbar", "undo", {});
}

function runRedo() {
  props.editor?.trigger("toolbar", "redo", {});
}

function runFormat() {
  const ed = props.editor;
  if (!ed) return;
  ed.focus();
  void ed.getAction("editor.action.formatDocument")?.run();
}

function runFind() {
  const ed = props.editor;
  if (!ed) return;
  ed.focus();
  void ed.getAction("actions.find")?.run();
}

function runPalette() {
  const ed = props.editor;
  if (!ed) return;
  ed.focus();
  // `editor.action.quickCommand` isn't registered as an editor-level action
  // under monaco-vscode-api — the command palette is the workbench's
  // `workbench.action.showCommands`. Invoke via ICommandService.
  void showCommandPalette();
}

const problemsCount = computed(() => errors.value + warnings.value);
const problemsSeverity = computed<"danger" | "warn" | "secondary">(() => {
  if (errors.value > 0) return "danger";
  if (warnings.value > 0) return "warn";
  return "secondary";
});
const problemsTitle = computed(() => {
  const parts: string[] = [];
  if (errors.value > 0) parts.push(`${errors.value} error${errors.value === 1 ? "" : "s"}`);
  if (warnings.value > 0) parts.push(`${warnings.value} warning${warnings.value === 1 ? "" : "s"}`);
  return parts.length ? `Problems: ${parts.join(", ")} — click to jump` : "No problems";
});
</script>

<template>
  <div class="editor-inner-toolbar" data-description="editor toolbar">
    <Button
      label="Save"
      icon="pi pi-save"
      size="small"
      :loading="saving"
      :disabled="!editor"
      v-tooltip.bottom="'Save (⌘S)'"
      data-description="editor toolbar save"
      @click="runSave"
    />
    <Button
      icon="pi pi-replay"
      size="small"
      severity="secondary"
      text
      :disabled="!canUndo"
      aria-label="Undo"
      v-tooltip.bottom="'Undo (⌘Z)'"
      data-description="editor toolbar undo"
      @click="runUndo"
    />
    <Button
      icon="pi pi-refresh"
      size="small"
      severity="secondary"
      text
      :disabled="!canRedo"
      aria-label="Redo"
      v-tooltip.bottom="'Redo (⌘⇧Z)'"
      data-description="editor toolbar redo"
      @click="runRedo"
    />
    <span class="separator" aria-hidden="true" />
    <Button
      v-if="formatSupported"
      icon="pi pi-align-left"
      size="small"
      severity="secondary"
      text
      aria-label="Format Document"
      v-tooltip.bottom="'Format Document (⌥⇧F)'"
      data-description="editor toolbar format"
      @click="runFormat"
    />
    <Button
      icon="pi pi-search"
      size="small"
      severity="secondary"
      text
      :disabled="!editor"
      aria-label="Find"
      v-tooltip.bottom="'Find (⌘F)'"
      data-description="editor toolbar find"
      @click="runFind"
    />
    <Button
      icon="pi pi-bars"
      size="small"
      severity="secondary"
      text
      :disabled="!editor"
      aria-label="Command Palette"
      v-tooltip.bottom="'Command Palette (⌘⇧P)'"
      data-description="editor toolbar palette"
      @click="runPalette"
    />
    <span class="spacer" aria-hidden="true" />
    <button
      type="button"
      :aria-label="problemsTitle"
      :title="problemsTitle"
      :disabled="problemsCount === 0"
      :class="['problems-button', `problems-${problemsSeverity}`]"
      data-description="editor toolbar problems"
      @click="jumpToNext"
    >
      <i class="pi pi-exclamation-circle" />
      <Badge
        :value="problemsCount"
        :severity="problemsSeverity"
        data-description="editor toolbar problems badge"
      />
    </button>
  </div>
</template>

<style scoped>
.editor-inner-toolbar {
  display: flex;
  align-items: center;
  gap: var(--gx-sp-2);
  padding: var(--gx-sp-1) 0;
  flex-wrap: wrap;
}

.separator {
  width: 1px;
  height: 1.25rem;
  background: var(--p-content-border-color, #dee2e6);
  align-self: stretch;
  margin: 0 var(--gx-sp-1);
}

.spacer {
  flex: 1 1 auto;
  min-width: 0;
}

.problems-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--p-border-radius, 6px);
  padding: var(--gx-sp-1) var(--gx-sp-2);
  cursor: pointer;
  color: var(--p-text-color-secondary, #6c757d);
  font: inherit;
}

.problems-button:hover:not(:disabled) {
  background: var(--p-content-hover-background, rgba(0, 0, 0, 0.04));
}

.problems-button:disabled {
  cursor: default;
  opacity: 0.7;
}

.problems-danger {
  color: var(--p-red-500, #e53935);
}

.problems-warn {
  color: var(--p-yellow-600, #c79100);
}
</style>
