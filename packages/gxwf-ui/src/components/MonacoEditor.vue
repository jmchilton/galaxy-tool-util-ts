<script setup lang="ts">
// Monaco editor host — mounts a monaco-vscode-api-backed editor bound to a
// single in-memory file. Extension + services init are one-shot per page;
// the model and editor are per-mount and disposed on unmount.
//
// Intentional lifecycle:
//   mount  → await services + extension load → create model + editor
//   update → push prop changes into the live model
//   unmount → dispose editor, model, and content-change subscription
//
// Leak check: `monaco.editor.getEditors().length` before vs. after a
// mount/unmount cycle should return to its prior value.

import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
// Side-effect: installs MonacoEnvironment on self before anything else
// touches monaco / workers.
import "../editor/monacoEnvironment";
import * as monaco from "monaco-editor";
import { buildMonacoUserConfigFromEnv, initMonacoServices } from "../editor/services";
import { loadGalaxyWorkflowsExtension } from "../editor/extensionSource";
import { resolveLanguageId } from "../editor/languageId";
import { upsertMemoryFile } from "../editor/fileSystem";

const props = withDefaults(
  defineProps<{
    content: string;
    fileName: string;
    readonly?: boolean;
    theme?: string;
  }>(),
  { readonly: false, theme: "vs-dark" },
);

const emit = defineEmits<{
  "update:content": [value: string];
  ready: [];
  error: [err: Error];
}>();

const hostEl = ref<HTMLDivElement | null>(null);
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
const model = shallowRef<monaco.editor.ITextModel | null>(null);
const ready = ref(false);
// Build-time flag (see .env.local.example). When set, expose a global handle
// and a data-monaco-ready attribute so E2E specs can drive the live editor.
const exposeForTests = import.meta.env.DEV || import.meta.env.VITE_GXWF_EXPOSE_MONACO === "1";
let contentSub: monaco.IDisposable | null = null;
// Guards the update-from-prop vs. update-from-user race: avoid re-emitting
// `update:content` for changes we just applied from the prop.
let applyingProp = false;

onMounted(async () => {
  try {
    await initMonacoServices(buildMonacoUserConfigFromEnv());
    await loadGalaxyWorkflowsExtension();
    if (!hostEl.value) return;

    const uri = upsertMemoryFile(props.fileName, props.content);
    const languageId = resolveLanguageId(props.fileName);
    const m = monaco.editor.createModel(props.content, languageId, uri);
    model.value = m;

    editor.value = monaco.editor.create(hostEl.value, {
      model: m,
      automaticLayout: true,
      theme: props.theme,
      readOnly: props.readonly,
      minimap: { enabled: false },
    });

    contentSub = m.onDidChangeContent(() => {
      if (applyingProp) return;
      emit("update:content", m.getValue());
    });

    if (exposeForTests) {
      (window as unknown as { __gxwfMonaco?: unknown }).__gxwfMonaco = {
        monaco,
        editor: editor.value,
        model: m,
      };
    }
    ready.value = true;
    emit("ready");
  } catch (err) {
    emit("error", err as Error);
  }
});

// Keep the model in sync with external content updates (e.g. when FileView
// re-fetches after a restore). Skip no-op writes to avoid cursor churn.
watch(
  () => props.content,
  (next) => {
    const m = model.value;
    if (!m || m.getValue() === next) return;
    applyingProp = true;
    try {
      m.setValue(next);
    } finally {
      applyingProp = false;
    }
  },
);

watch(
  () => props.readonly,
  (next) => editor.value?.updateOptions({ readOnly: next }),
);

watch(
  () => props.theme,
  (next) => monaco.editor.setTheme(next),
);

onBeforeUnmount(() => {
  contentSub?.dispose();
  contentSub = null;
  editor.value?.dispose();
  editor.value = null;
  model.value?.dispose();
  model.value = null;
  ready.value = false;
  if (exposeForTests) {
    delete (window as unknown as { __gxwfMonaco?: unknown }).__gxwfMonaco;
  }
});
</script>

<template>
  <div
    ref="hostEl"
    class="monaco-host"
    :data-monaco-ready="exposeForTests && ready ? 'true' : undefined"
  />
</template>

<style scoped>
.monaco-host {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  height: 100%;
}
</style>
