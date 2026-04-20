---
"@galaxy-tool-util/gxwf-ui": minor
---

Add an editor toolbar next to the embedded Monaco editor surfacing Save,
Undo/Redo, Format Document (when a formatter is registered), Find, Command
Palette, and an LSP Problems badge that jumps to the next diagnostic and
turns red on errors. `MonacoEditor.vue` now exposes `editor` + `model` to
its parent via `defineExpose`, which `FileView.vue` forwards into the new
toolbar. EditorShell (textarea) fallback chrome is unchanged.
