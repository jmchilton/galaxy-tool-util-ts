<template>
  <div class="file-view">
    <div class="browser-panel">
      <h1>Files</h1>
      <FileBrowser
        :root="root"
        :loading="loading"
        v-model:expanded-keys="expandedKeys"
        data-description="file browser"
        @select="onFileSelect"
      />
    </div>

    <div v-if="selectedPath" class="editor-panel">
      <div class="editor-toolbar">
        <nav
          class="editor-breadcrumb"
          :title="selectedPath"
          data-description="file breadcrumb"
          aria-label="File path"
        >
          <template v-for="(crumb, i) in breadcrumb" :key="i">
            <span v-if="crumb === null" class="crumb ellipsis" aria-hidden="true">…</span>
            <button
              v-else-if="i < breadcrumb.length - 1"
              type="button"
              class="crumb crumb-dir"
              @click="expandToPath(crumb.path)"
            >
              {{ crumb.label }}
            </button>
            <span v-else class="crumb crumb-file">{{ crumb.label }}</span>
            <span v-if="i < breadcrumb.length - 1" class="crumb-sep" aria-hidden="true">/</span>
          </template>
          <span v-if="dirty" class="dirty-indicator" aria-label="Unsaved changes">•</span>
        </nav>
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
      <!-- Monaco-only editor toolbar. Renders only when MonacoEditor has booted
           (editor ref populated via defineExpose). EditorShell path keeps the
           chrome above verbatim. -->
      <EditorToolbar
        v-if="monacoEnabled && !monacoFailed && editor"
        :editor="editor"
        :model="model"
        :saving="saving"
        :on-save="() => void onSave()"
      />
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
          ref="monacoRef"
          :content="editorContent"
          :file-name="selectedPath"
          :on-save="() => void onSave()"
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
import { useToast } from "primevue/usetoast";
import Message from "primevue/message";
import Button from "primevue/button";
import ProgressSpinner from "primevue/progressspinner";
import FileBrowser from "../components/FileBrowser.vue";
import EditorShell from "../components/EditorShell.vue";
import EditorToolbar from "../components/EditorToolbar.vue";
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

const toast = useToast();

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
const saveSuccess = ref(false);
// Single-level undo: checkpoint stores the state before the most recent save.
// Saving again overwrites checkpoint so undo always targets the last save point.
const checkpoint = ref<CheckpointModel | null>(null);

// Surface browser-load errors as a transient toast rather than an inline banner
// so the file tree layout doesn't shift.
watch(error, (msg) => {
  if (msg) toast.add({ severity: "error", summary: "Files", detail: msg, life: 6000 });
});

// Build-time opt-in (see packages/gxwf-ui/.env.local.example). When unset,
// the Monaco bundle is dead-code-eliminated (see defineAsyncComponent above)
// and EditorShell renders as today.
const monacoFailed = ref(false);
const monacoErrorMessage = ref("");

// Handle to the MonacoEditor component instance. Its defineExpose surfaces
// `editor` + `model` shallowRefs; we reach them via computeds so EditorToolbar
// re-renders when they flip null → live.
const monacoRef = ref<{
  editor: import("monaco-editor").editor.IStandaloneCodeEditor | null;
  model: import("monaco-editor").editor.ITextModel | null;
} | null>(null);
const editor = computed(() => monacoRef.value?.editor ?? null);
const model = computed(() => monacoRef.value?.model ?? null);
const dirty = computed(() => {
  const fm = fileModel.value;
  if (!fm || fm.type !== "file") return false;
  return editorContent.value !== (typeof fm.content === "string" ? fm.content : "");
});

// Middle-ellipsis: show every segment up to MAX_CRUMBS, otherwise keep the
// first + last two and drop the middle. Full path remains in the title attr.
const MAX_CRUMBS = 5;
type Crumb = { label: string; path: string };
const breadcrumb = computed<(Crumb | null)[]>(() => {
  if (!selectedPath.value) return [];
  const segs = selectedPath.value.split("/").filter(Boolean);
  const withPaths: Crumb[] = segs.map((label, i) => ({
    label,
    path: segs.slice(0, i + 1).join("/"),
  }));
  if (withPaths.length <= MAX_CRUMBS) return withPaths;
  return [withPaths[0], null, withPaths[withPaths.length - 2], withPaths[withPaths.length - 1]];
});

// Tree expansion state (shared with FileBrowser via v-model:expanded-keys).
// Clicking a breadcrumb segment flips every ancestor prefix to true so the
// tree reveals that directory. Cascading fetches happen via FileBrowser's
// existing @node-expand handler.
const expandedKeys = ref<Record<string, boolean>>({});

function expandToPath(path: string) {
  const segs = path.split("/").filter(Boolean);
  const next = { ...expandedKeys.value };
  for (let i = 0; i < segs.length; i++) {
    next[segs.slice(0, i + 1).join("/")] = true;
  }
  expandedKeys.value = next;
}

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
    toast.add({
      severity: "error",
      summary: "Load failed",
      detail: `Failed to load file: ${path}`,
      life: 6000,
    });
  } finally {
    loadingFile.value = false;
  }
}

async function onSave() {
  if (!selectedPath.value || !fileModel.value) return;
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
    toast.add({
      severity: "error",
      summary: "Save failed",
      detail: err instanceof Error ? err.message : "Save failed",
      life: 8000,
    });
  } finally {
    saving.value = false;
  }
}

async function onRestore() {
  if (!selectedPath.value || !checkpoint.value) return;
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
    toast.add({ severity: "success", summary: "Restored", life: 3000 });
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Restore failed",
      detail: err instanceof Error ? err.message : "Restore failed",
      life: 8000,
    });
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
  margin: 0 0 var(--gx-sp-4);
  font-size: var(--gx-fs-xl);
}

.file-view {
  display: flex;
  gap: var(--gx-sp-6);
  height: 100%;
  min-height: 0;
}

.browser-panel {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--gx-sp-3);
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
  gap: var(--gx-sp-3);
}

.editor-breadcrumb {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--gx-sp-1);
  font-family: var(--gx-mono);
  font-size: var(--gx-fs-sm);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.crumb {
  color: var(--p-text-color-secondary, #6c757d);
  font: inherit;
}

button.crumb {
  background: none;
  border: none;
  padding: 0 var(--gx-sp-1);
  cursor: pointer;
  border-radius: 3px;
}

button.crumb:hover {
  color: var(--p-text-color, inherit);
  background: var(--p-content-hover-background, rgba(0, 0, 0, 0.04));
}

.crumb.crumb-file {
  color: var(--p-text-color, inherit);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.crumb.ellipsis {
  color: var(--p-text-color-secondary, #6c757d);
  opacity: 0.7;
}

.crumb-sep {
  color: var(--p-text-color-secondary, #6c757d);
  opacity: 0.5;
}

.dirty-indicator {
  color: var(--gx-gold, #d0bd2a);
  font-size: var(--gx-fs-lg);
  line-height: 1;
  margin-left: var(--gx-sp-2);
}
</style>
