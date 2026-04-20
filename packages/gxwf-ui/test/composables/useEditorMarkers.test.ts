import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectScope, shallowRef } from "vue";

// monaco-editor is aliased (see package.json) to a Monaco build that needs the
// full vscode-api services to load. We're testing the composable in isolation,
// so replace it with a minimal shim: just the pieces `useEditorMarkers` touches.
const listeners = new Set<(uris: { toString(): string }[]) => void>();
let currentMarkers: { severity: number; message: string; resource: { toString(): string } }[] = [];

vi.mock("monaco-editor", () => ({
  MarkerSeverity: { Hint: 1, Info: 2, Warning: 4, Error: 8 },
  editor: {
    onDidChangeMarkers: (fn: (uris: { toString(): string }[]) => void) => {
      listeners.add(fn);
      return { dispose: () => listeners.delete(fn) };
    },
    getModelMarkers: ({ resource }: { resource: { toString(): string } }) =>
      currentMarkers.filter((m) => m.resource.toString() === resource.toString()),
  },
}));

// Import under test AFTER the mock — ESM hoists vi.mock, but the explicit
// ordering makes the intent obvious to future readers.
const { useEditorMarkers } = await import("../../src/composables/useEditorMarkers");

function fakeUri(value: string) {
  return { toString: () => value };
}

function setMarkers(uri: { toString(): string }, entries: { severity: number; message: string }[]) {
  currentMarkers = entries.map((e) => ({ ...e, resource: uri }));
  // Emulate monaco's delivery: every change fires listeners with the changed URIs.
  for (const fn of listeners) fn([uri]);
}

function makeModel(uriValue: string) {
  return { uri: fakeUri(uriValue) } as unknown as import("monaco-editor").editor.ITextModel;
}

function makeEditor() {
  const focus = vi.fn();
  const actionRun = vi.fn();
  const getAction = vi.fn((id: string) => {
    if (id === "editor.action.marker.next") return { run: actionRun };
    return null;
  });
  const editor = {
    focus,
    getAction,
  } as unknown as import("monaco-editor").editor.IStandaloneCodeEditor;
  return { editor, focus, getAction, actionRun };
}

describe("useEditorMarkers", () => {
  beforeEach(() => {
    listeners.clear();
    currentMarkers = [];
  });

  it("counts errors and warnings scoped to the current model's URI", () => {
    const scope = effectScope();
    try {
      const { editor } = makeEditor();
      const editorRef = shallowRef(editor);
      const model = makeModel("inmemory://foo.yml");
      const modelRef = shallowRef<import("monaco-editor").editor.ITextModel | null>(model);

      let result!: ReturnType<typeof useEditorMarkers>;
      scope.run(() => {
        result = useEditorMarkers(editorRef, modelRef);
      });

      expect(result.errors.value).toBe(0);
      expect(result.warnings.value).toBe(0);

      setMarkers(model.uri, [
        { severity: 8, message: "bad" },
        { severity: 8, message: "also bad" },
        { severity: 4, message: "smelly" },
        { severity: 2, message: "fyi" },
      ]);

      expect(result.errors.value).toBe(2);
      expect(result.warnings.value).toBe(1);
    } finally {
      scope.stop();
    }
  });

  it("ignores marker changes for unrelated URIs", () => {
    const scope = effectScope();
    try {
      const { editor } = makeEditor();
      const editorRef = shallowRef(editor);
      const model = makeModel("inmemory://foo.yml");
      const modelRef = shallowRef<import("monaco-editor").editor.ITextModel | null>(model);

      let result!: ReturnType<typeof useEditorMarkers>;
      scope.run(() => {
        result = useEditorMarkers(editorRef, modelRef);
      });

      setMarkers(fakeUri("inmemory://other.yml"), [{ severity: 8, message: "nope" }]);

      expect(result.errors.value).toBe(0);
    } finally {
      scope.stop();
    }
  });

  it("resubscribes when the model ref swaps", async () => {
    const scope = effectScope();
    try {
      const { editor } = makeEditor();
      const editorRef = shallowRef(editor);
      const first = makeModel("inmemory://first.yml");
      const second = makeModel("inmemory://second.yml");
      const modelRef = shallowRef<import("monaco-editor").editor.ITextModel | null>(first);

      let result!: ReturnType<typeof useEditorMarkers>;
      scope.run(() => {
        result = useEditorMarkers(editorRef, modelRef);
      });

      setMarkers(first.uri, [{ severity: 8, message: "bad" }]);
      expect(result.errors.value).toBe(1);

      modelRef.value = second;
      // Flush the watcher (post-flush is sync for our purposes — just tick).
      await Promise.resolve();
      await Promise.resolve();

      // Second model starts clean; first model's markers are out of scope now.
      expect(result.errors.value).toBe(0);

      setMarkers(second.uri, [
        { severity: 8, message: "x" },
        { severity: 4, message: "y" },
      ]);
      expect(result.errors.value).toBe(1);
      expect(result.warnings.value).toBe(1);
    } finally {
      scope.stop();
    }
  });

  it("jumpToNext focuses the editor and runs editor.action.marker.next", () => {
    const scope = effectScope();
    try {
      const { editor, focus, getAction, actionRun } = makeEditor();
      const editorRef = shallowRef(editor);
      const model = makeModel("inmemory://foo.yml");
      const modelRef = shallowRef<import("monaco-editor").editor.ITextModel | null>(model);

      let result!: ReturnType<typeof useEditorMarkers>;
      scope.run(() => {
        result = useEditorMarkers(editorRef, modelRef);
      });

      result.jumpToNext();

      expect(focus).toHaveBeenCalledOnce();
      expect(getAction).toHaveBeenCalledWith("editor.action.marker.next");
      expect(actionRun).toHaveBeenCalledOnce();
    } finally {
      scope.stop();
    }
  });

  it("disposes the marker subscription when the scope stops", () => {
    const scope = effectScope();
    const { editor } = makeEditor();
    const editorRef = shallowRef(editor);
    const model = makeModel("inmemory://foo.yml");
    const modelRef = shallowRef<import("monaco-editor").editor.ITextModel | null>(model);

    scope.run(() => {
      useEditorMarkers(editorRef, modelRef);
    });

    expect(listeners.size).toBe(1);
    scope.stop();
    expect(listeners.size).toBe(0);
  });
});
