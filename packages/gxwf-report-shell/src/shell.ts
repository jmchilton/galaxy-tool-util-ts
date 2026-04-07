import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Aura from "@primevue/themes/aura";
import ReportShell from "./ReportShell.vue";

interface ReportPayload {
  type: "validate" | "lint" | "clean" | "roundtrip";
  data: unknown;
}

function mount(payload: ReportPayload) {
  const app = createApp(ReportShell, { report: payload });
  app.use(PrimeVue, { theme: { preset: Aura } });
  app.mount("#gxwf-report");
}

// Support two data injection patterns:
// 1. Static HTML: window.__GXWF_REPORT__ set before this script tag
// 2. VSCode webview / dynamic: postMessage after load
const initial = (window as unknown as Record<string, unknown>).__GXWF_REPORT__ as
  | ReportPayload
  | undefined;
if (initial) {
  mount(initial);
} else {
  // postMessage-based injection for VSCode webview or other dynamic hosts.
  // Host sends: { command: "render", type: "validate", data: {...} }
  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data as { command?: string; type?: string; data?: unknown };
    if (msg.command === "render" && msg.type && msg.data) {
      mount({ type: msg.type as ReportPayload["type"], data: msg.data });
    }
  });
}
