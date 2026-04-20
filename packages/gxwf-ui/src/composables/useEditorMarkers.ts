import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from "vue";
import * as monaco from "monaco-editor";

export interface UseEditorMarkersResult {
  errors: ComputedRef<number>;
  warnings: ComputedRef<number>;
  jumpToNext: () => void;
}

// Tracks LSP / linter markers for a single model. Used by EditorToolbar's
// Problems badge. `onScopeDispose` (not `onBeforeUnmount`) so the composable
// works both inside a component and inside a bare effectScope for tests.
export function useEditorMarkers(
  editor: Ref<monaco.editor.IStandaloneCodeEditor | null>,
  model: Ref<monaco.editor.ITextModel | null>,
): UseEditorMarkersResult {
  const markers = ref<monaco.editor.IMarker[]>([]);
  let sub: monaco.IDisposable | null = null;

  function refresh(m: monaco.editor.ITextModel) {
    markers.value = monaco.editor.getModelMarkers({ resource: m.uri });
  }

  watch(
    model,
    (next) => {
      sub?.dispose();
      sub = null;
      if (!next) {
        markers.value = [];
        return;
      }
      refresh(next);
      const uriStr = next.uri.toString();
      sub = monaco.editor.onDidChangeMarkers((uris) => {
        if (uris.some((u) => u.toString() === uriStr)) refresh(next);
      });
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    sub?.dispose();
    sub = null;
  });

  const errors = computed(
    () => markers.value.filter((m) => m.severity === monaco.MarkerSeverity.Error).length,
  );
  const warnings = computed(
    () => markers.value.filter((m) => m.severity === monaco.MarkerSeverity.Warning).length,
  );

  function jumpToNext() {
    const ed = editor.value;
    if (!ed) return;
    ed.focus();
    void ed.getAction("editor.action.marker.next")?.run();
  }

  return { errors, warnings, jumpToNext };
}
