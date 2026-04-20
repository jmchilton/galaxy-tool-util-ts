---
"@galaxy-tool-util/gxwf-ui": patch
---

Fix the toolbar Command Palette button — the previous
`editor.trigger(..., "editor.action.quickCommand")` call was a no-op under
monaco-vscode-api because `editor.action.quickCommand` is not an
editor-level action in this embed; the palette is owned by the workbench's
`workbench.action.showCommands`. The button now invokes that command via
`ICommandService`. Also moves the Ctrl+S / Cmd+S save-handler registration
into `MonacoEditor.vue`'s mount hook so the override is in place before the
editor's ready marker is set (previously raced against the keybinding on a
fast save).
