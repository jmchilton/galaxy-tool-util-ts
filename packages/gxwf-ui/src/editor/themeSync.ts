// Keeps the workbench's active color theme in lockstep with the app's
// dark-mode class on <html>. App.vue owns the toggle and the localStorage
// round-trip; this module is the one-way bridge from that DOM class into the
// VS Code configuration service.
//
// Intentional single-instance: called once from initMonacoServices. Multiple
// MonacoEditor mounts share the same observer rather than allocating one per
// editor — the workbench theme service is process-global, so a single watcher
// is sufficient and avoids leaking handlers on fast mount/unmount cycles.

import { updateUserConfiguration } from "@codingame/monaco-vscode-configuration-service-override";

let installed = false;

function currentThemeId(): "gxwf-dark" | "gxwf-light" {
  return document.documentElement.classList.contains("dark") ? "gxwf-dark" : "gxwf-light";
}

function pushTheme(): void {
  void updateUserConfiguration(JSON.stringify({ "workbench.colorTheme": currentThemeId() }));
}

export function installThemeSync(): void {
  if (installed) return;
  installed = true;
  // Catches any dark-class flip that happened between initUserConfiguration's
  // snapshot and now.
  pushTheme();
  const observer = new MutationObserver(pushTheme);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}
