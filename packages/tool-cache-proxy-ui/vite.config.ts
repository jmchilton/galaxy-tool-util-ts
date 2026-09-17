import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": process.env.GALAXY_TOOL_PROXY_URL ?? "http://localhost:8080",
    },
  },
  build: { target: "esnext" },
});
