<template>
  <div class="file-view">
    <div class="browser-panel">
      <h1>Files</h1>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <FileBrowser :root="root" :loading="loading" @select="onFileSelect" />
    </div>

    <div v-if="selectedPath" class="editor-panel">
      <div class="editor-toolbar">
        <span class="editor-path">{{ selectedPath }}</span>
        <Button
          v-if="checkpoint"
          label="Undo"
          icon="pi pi-undo"
          size="small"
          severity="secondary"
          :loading="restoring"
          @click="() => void onRestore()"
        />
        <Button
          label="Save"
          icon="pi pi-save"
          size="small"
          :loading="saving"
          :disabled="!fileModel || loadingFile"
          @click="() => void onSave()"
        />
      </div>
      <Message v-if="editorError" severity="error" :closable="false">{{ editorError }}</Message>
      <Message v-if="saveSuccess" severity="success" :closable="false">Saved.</Message>
      <ProgressSpinner v-if="loadingFile" style="width: 2rem; height: 2rem" />
      <!-- diagnostics prop intentionally omitted: wired in Phase 5 when operation
           results are mapped to line-level diagnostics for Monaco integration -->
      <template v-else>
        <Message v-if="monacoFailed" severity="warn" :closable="false">
          Monaco editor failed to load ({{ monacoErrorMessage }}). Falling back to the basic editor;
          reload the page to retry. If VITE_GXWF_MONACO=1 was intentional, check that
          public/ext/galaxy-workflows.vsix exists and the devtools console for details.
        </Message>
        <MonacoEditor
          v-if="monacoEnabled && !monacoFailed && selectedPath"
          :content="editorContent"
          :file-name="selectedPath"
          @update:content="onEdit($event)"
          @error="onMonacoError"
        />
        <EditorShell
          v-else
          :content="editorContent"
          :language="editorLanguage"
          @update:content="onEdit($event)"
        />
      </template>
    </div>

    <div v-else class="editor-placeholder">
      <span>Select a file to edit.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Message from "primevue/message";
import Button from "primevue/button";
import ProgressSpinner from "primevue/progressspinner";
import FileBrowser from "../components/FileBrowser.vue";
import EditorShell from "../components/EditorShell.vue";
import { useContents } from "../composables/useContents";
import type { ContentsModel, CheckpointModel } from "../composables/useContents";
import { clearOpCache } from "../composables/useOperation";
import { useWorkflows } from "../composables/useWorkflows";

// Dynamic import gated on the build-time flag. When VITE_GXWF_MONACO is unset,
// the import() branch is dead code and Vite drops Monaco + the 12 @codingame
// packages from the default bundle.
const monacoEnabled = import.meta.env.VITE_GXWF_MONACO === "1";
const MonacoEditor = monacoEnabled
  ? defineAsyncComponent(() => import("../components/MonacoEditor.vue"))
  : null;

const {
  root,
  loading,
  error,
  fetchRoot,
  fetchPath,
  writeFile,
  createCheckpoint,
  restoreCheckpoint,
} = useContents();
const { fetchWorkflows } = useWorkflows();

const selectedPath = ref<string | null>(null);
const fileModel = ref<ContentsModel | null>(null);
const editorContent = ref("");
const loadingFile = ref(false);
const saving = ref(false);
const restoring = ref(false);
const editorError = ref<string | null>(null);
const saveSuccess = ref(false);
// Single-level undo: checkpoint stores the state before the most recent save.
// Saving again overwrites checkpoint so undo always targets the last save point.
const checkpoint = ref<CheckpointModel | null>(null);

// Build-time opt-in (see packages/gxwf-ui/.env.local.example). When unset,
// the Monaco bundle is dead-code-eliminated (see defineAsyncComponent above)
// and EditorShell renders as today.
const monacoFailed = ref(false);
const monacoErrorMessage = ref("");

function onMonacoError(err: Error) {
  monacoFailed.value = true;
  monacoErrorMessage.value = err.message;
  console.error("[gxwf-ui] Monaco failed to load:", err);
}

// Used only by the EditorShell fallback. MonacoEditor resolves its own
// language from the filename via src/editor/languageId.ts; the two maps are
// intentionally separate (Monaco needs gxformat2/gxwftests IDs contributed
// by the extension; textarea-mode needs plain "yaml" for Prism-style hints).
const editorLanguage = computed(() => {
  if (!selectedPath.value) return "text";
  const ext = selectedPath.value.split(".").pop() ?? "";
  const map: Record<string, string> = {
    ga: "yaml",
    gxwf: "yaml",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    py: "python",
    ts: "typescript",
    js: "javascript",
    md: "markdown",
  };
  return map[ext] ?? "text";
});

function onEdit(value: string) {
  editorContent.value = value;
  // Clear success banner once the user starts editing after a save.
  saveSuccess.value = false;
}

async function onFileSelect(path: string) {
  selectedPath.value = path;
  fileModel.value = null;
  editorContent.value = "";
  editorError.value = null;
  saveSuccess.value = false;
  checkpoint.value = null;
  loadingFile.value = true;
  try {
    const model = await fetchPath(path);
    if (model && model.type === "file") {
      fileModel.value = model;
      editorContent.value = typeof model.content === "string" ? model.content : "";
    }
  } catch {
    editorError.value = `Failed to load file: ${path}`;
  } finally {
    loadingFile.value = false;
  }
}

async function onSave() {
  if (!selectedPath.value || !fileModel.value) return;
  editorError.value = null;
  saveSuccess.value = false;
  saving.value = true;
  try {
    // Checkpoint first so the user can undo.
    checkpoint.value = await createCheckpoint(selectedPath.value);
    // Write the new content; server auto-refreshes the workflow index.
    const updated = await writeFile(selectedPath.value, editorContent.value, fileModel.value);
    fileModel.value = updated;
    // Invalidate cached operation results — they're stale after a file change.
    clearOpCache(selectedPath.value);
    // Refresh workflow list to reflect any changes to format/category metadata.
    void fetchWorkflows();
    saveSuccess.value = true;
  } catch (err) {
    editorError.value = err instanceof Error ? err.message : "Save failed";
  } finally {
    saving.value = false;
  }
}

async function onRestore() {
  if (!selectedPath.value || !checkpoint.value) return;
  editorError.value = null;
  saveSuccess.value = false;
  restoring.value = true;
  try {
    await restoreCheckpoint(selectedPath.value, checkpoint.value.id);
    // Re-fetch so the editor shows the restored content.
    const model = await fetchPath(selectedPath.value);
    if (model && model.type === "file") {
      fileModel.value = model;
      editorContent.value = typeof model.content === "string" ? model.content : "";
    }
    checkpoint.value = null;
    clearOpCache(selectedPath.value);
    void fetchWorkflows();
  } catch (err) {
    editorError.value = err instanceof Error ? err.message : "Restore failed";
  } finally {
    restoring.value = false;
  }
}

const route = useRoute();
const router = useRouter();

// Load the file named in the route param when the URL drives navigation
// (bookmark, shared link, or E2E harness). Mirrors WorkflowView's pattern.
function routeFilePath(): string | null {
  const raw = route.params.path;
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw.join("/") : raw;
  return value || null;
}

onMounted(async () => {
  await fetchRoot();
  const initial = routeFilePath();
  if (initial) await onFileSelect(initial);
});

watch(
  () => route.params.path,
  async (next, prev) => {
    if (next === prev) return;
    const path = routeFilePath();
    if (path && path !== selectedPath.value) {
      await onFileSelect(path);
    }
  },
);

// Keep the URL in sync with user-driven tree selection so reloads land back
// on the same file. Pushes a new history entry only when the path changes.
watch(selectedPath, (next) => {
  if (next && next !== routeFilePath()) {
    void router.replace(`/files/${next}`);
  }
});
</script>

<style scoped>
h1 {
  margin: 0 0 1rem;
  font-size: 1.5rem;
}

.file-view {
  display: flex;
  gap: 1.5rem;
  height: 100%;
  min-height: 0;
}

.browser-panel {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.editor-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--p-text-color-secondary, #6c757d);
  font-style: italic;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.editor-path {
  flex: 1;
  font-family: monospace;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
