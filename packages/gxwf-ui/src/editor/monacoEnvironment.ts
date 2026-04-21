// Side-effect module. Importing installs `self.MonacoEnvironment` with the
// `getWorker` / `getWorkerUrl` / `getWorkerOptions` triple that
// monaco-vscode-api needs. Must run before any service init or editor
// creation.

import EditorWorker from "@codingame/monaco-vscode-api/workers/editor.worker?worker";
import TextMateWorker from "@codingame/monaco-vscode-textmate-service-override/worker?worker";
import ExtensionHostWorker from "./extensionHostWorker?worker";
import ExtensionHostWorkerUrl from "./extensionHostWorker?worker&url";

// Staged by scripts/copy-monaco-iframe.mjs (postinstall). The override
// package's exports map forbids deep .html imports, so the iframe is served
// from /public/monaco/ instead.
const WebWorkerExtensionHostIframeUrl = "/monaco/webWorkerExtensionHostIframe.html";

const EXT_HOST_LABELS = new Set([
  "extensionHost",
  "extensionHostWorker",
  "extensionHostWorkerMain",
]);

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    switch (label) {
      case "editorWorkerService":
        return new EditorWorker();
      case "TextMateWorker":
        return new TextMateWorker();
      default:
        if (EXT_HOST_LABELS.has(label)) return new ExtensionHostWorker();
        throw new Error(`[gxwf-ui] unknown worker label: ${label}`);
    }
  },
  // Iframe branches on workerOptions.type: 'module' → `await import(url)`;
  // otherwise `importScripts(url)`. Vite emits ESM workers, so return
  // 'module' for extension-host labels.
  getWorkerOptions(_moduleId: string, label: string): WorkerOptions | undefined {
    if (EXT_HOST_LABELS.has(label)) return { type: "module" };
    return undefined;
  },
  getWorkerUrl(_moduleId: string, label: string) {
    if (label === "webWorkerExtensionHostIframe") return WebWorkerExtensionHostIframeUrl;
    if (EXT_HOST_LABELS.has(label)) return ExtensionHostWorkerUrl;
    throw new Error(`[gxwf-ui] no worker URL for label: ${label}`);
  },
};
