<template>
  <!-- EditorShell: a textarea-based placeholder designed for drop-in Monaco/CodeMirror replacement.

       Monaco integration path:
       1. Install @monaco-editor/vue3 (or use monaco-editor directly).
       2. Replace <textarea> with:
            <MonacoEditor
              :language="language"
              :value="content"
              :options="{ readOnly: readonly }"
              @change="emit('update:content', $event)"
              style="height: 100%"
            />
       3. Map `diagnostics` → IMarkerData[] via monaco.editor.setModelMarkers(model, 'gxwf', markers).
          Severity mapping: "error" → 8, "warning" → 4, "info" → 2.
       4. The props/emits interface is intentionally Monaco-compatible — no other changes needed. -->
  <div class="editor-shell">
    <textarea
      class="editor-textarea"
      :value="content"
      :readonly="readonly"
      spellcheck="false"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
    />
    <ul v-if="diagnostics && diagnostics.length" class="diagnostics-list">
      <li
        v-for="(d, i) in diagnostics"
        :key="i"
        :class="['diagnostic', `diagnostic--${d.severity}`]"
      >
        <span class="diag-loc">L{{ d.line }}</span>
        <span class="diag-msg">{{ d.message }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// Diagnostic interface is Monaco IMarkerData-compatible.
// When upgrading to Monaco, convert via monaco.editor.setModelMarkers():
//   { startLineNumber: d.line, endLineNumber: d.endLine ?? d.line,
//     startColumn: d.column ?? 1, endColumn: d.endColumn ?? Number.MAX_SAFE_INTEGER,
//     message: d.message, severity: { error: 8, warning: 4, info: 2 }[d.severity] }
export interface Diagnostic {
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: "error" | "warning" | "info";
}

defineProps<{
  content: string;
  language: string;
  diagnostics?: Diagnostic[];
  readonly?: boolean;
}>();

const emit = defineEmits<{
  "update:content": [value: string];
}>();
</script>

<style scoped>
.editor-shell {
  display: flex;
  flex-direction: column;
  gap: var(--gx-sp-2);
  flex: 1;
  min-height: 0;
}

.editor-textarea {
  flex: 1;
  min-height: 400px;
  width: 100%;
  font-family: var(--gx-mono);
  font-size: var(--gx-fs-sm);
  line-height: 1.5;
  padding: var(--gx-sp-3);
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--p-content-border-color, #dee2e6);
  border-radius: var(--p-border-radius, 4px);
  background: var(--p-content-background, #fff);
  color: var(--p-text-color, #212529);
  outline: none;
}

.editor-textarea:focus {
  border-color: var(--gx-gold, #d0bd2a);
  box-shadow: 0 0 0 2px rgba(208, 189, 42, 0.2);
}

.diagnostics-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--gx-sp-1);
  font-size: 0.8rem;
}

.diagnostic {
  display: flex;
  gap: var(--gx-sp-2);
  padding: 0.2rem var(--gx-sp-2);
  border-radius: 3px;
}

.diagnostic--error {
  background: var(--p-red-100, #fee2e2);
  color: var(--p-red-800, #991b1b);
}

.diagnostic--warning {
  background: var(--p-yellow-100, #fef9c3);
  color: var(--p-yellow-800, #854d0e);
}

.diagnostic--info {
  background: var(--p-blue-100, #dbeafe);
  color: var(--p-blue-800, #1e40af);
}

.diag-loc {
  font-weight: 600;
  flex-shrink: 0;
}

.diag-msg {
  flex: 1;
}
</style>
