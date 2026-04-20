---
"@galaxy-tool-util/gxwf-ui": minor
---

Wire Ctrl+S / Cmd+S to the gxwf-ui save handler inside the embedded Monaco
editor. Overrides the workbench `workbench.action.files.save` command via
`CommandsRegistry` so the built-in keybinding routes into `FileView.onSave`
— the same handler the toolbar Save button invokes. EditorShell (textarea)
fallback path is unaffected.
