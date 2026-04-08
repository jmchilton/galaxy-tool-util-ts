import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/workflows": "http://localhost:8000",
      "/api": "http://localhost:8000",
    },
  },
});
