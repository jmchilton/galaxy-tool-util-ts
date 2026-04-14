import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "dist",
    lib: {
      entry: "src/shell.ts",
      name: "GxwfReportShell",
      formats: ["iife"],
      fileName: () => "shell.iife.js",
    },
    rolldownOptions: {
      // Bundle everything — no externals. Self-contained for CDN delivery.
      external: [],
      output: {
        // Single CSS file alongside the JS
        assetFileNames: "shell.[ext]",
      },
    },
  },
});
