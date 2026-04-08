import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/workflows": process.env.GXWF_BACKEND_URL ?? "http://localhost:8000",
      "/api": process.env.GXWF_BACKEND_URL ?? "http://localhost:8000",
    },
  },
});
