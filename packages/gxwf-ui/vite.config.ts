import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// When VITE_GXWF_EXT_SOURCE points at a folder on disk (dev), Vite must be
// allowed to serve files from that root via /@fs. Parse out the path here so
// server.fs.allow can include it.
const extSource = process.env.VITE_GXWF_EXT_SOURCE ?? "";
const folderMatch = extSource.match(/^folder:(.+)$/);
const extFolder = folderMatch ? folderMatch[1] : undefined;

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/workflows": process.env.GXWF_BACKEND_URL ?? "http://localhost:8000",
      "/api": process.env.GXWF_BACKEND_URL ?? "http://localhost:8000",
    },
    fs: {
      allow: [".", ...(extFolder ? [extFolder] : [])],
    },
  },
  // Extension-host iframe branches on workerOptions.type === 'module' and uses
  // `await import(url)` — Vite's ESM worker output works as-is.
  worker: { format: "es" },
  optimizeDeps: {
    // The @codingame/monaco-vscode-* packages register asset URLs with
    // `new URL('./x', import.meta.url)`. The Vite optimizer bundles them into
    // node_modules/.vite/deps but does not copy sibling assets, so skip
    // optimization and serve them from their original location.
    exclude: [
      "@codingame/monaco-vscode-api",
      "@codingame/monaco-vscode-api/extensions",
      "@codingame/monaco-vscode-editor-api",
      "@codingame/monaco-vscode-extensions-service-override",
      "@codingame/monaco-vscode-languages-service-override",
      "@codingame/monaco-vscode-textmate-service-override",
      "@codingame/monaco-vscode-theme-service-override",
      "@codingame/monaco-vscode-configuration-service-override",
      "@codingame/monaco-vscode-files-service-override",
      "@codingame/monaco-vscode-keybindings-service-override",
      "@codingame/monaco-vscode-notifications-service-override",
      "@codingame/monaco-vscode-quickaccess-service-override",
      "vscode",
      "monaco-editor",
    ],
  },
  build: { target: "esnext" },
});
