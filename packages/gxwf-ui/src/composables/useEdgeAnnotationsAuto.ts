import { computed, ref } from "vue";

import { useClientEdgeAnnotations } from "./useClientEdgeAnnotations";
import { useEdgeAnnotations } from "./useEdgeAnnotations";

export type EdgeAnnotationsMode = "server" | "client";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const SESSION_KEY = "gxwf-ui:annotations-mode";
const HEALTHZ_TIMEOUT_MS = 1500;

interface HealthzPayload {
  status?: string;
  features?: string[];
}

function readSessionMode(): EdgeAnnotationsMode | null {
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    return v === "server" || v === "client" ? v : null;
  } catch {
    return null;
  }
}

function writeSessionMode(mode: EdgeAnnotationsMode): void {
  try {
    sessionStorage.setItem(SESSION_KEY, mode);
  } catch {
    // sessionStorage may be unavailable (sandboxed iframes); not fatal — we'll
    // re-probe next build.
  }
}

function readEnvOverride(): EdgeAnnotationsMode | null {
  const raw = import.meta.env.VITE_GXWF_EDGE_ANNOTATIONS_MODE;
  if (raw === "server" || raw === "client") return raw;
  return null;
}

async function probeServer(signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/healthz`, { signal });
    if (!res.ok) return false;
    const body = (await res.json()) as HealthzPayload;
    return Array.isArray(body.features) && body.features.includes("edge-annotations");
  } catch {
    return false;
  }
}

async function decideMode(): Promise<EdgeAnnotationsMode> {
  const override = readEnvOverride();
  if (override) return override;
  const cached = readSessionMode();
  if (cached) return cached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTHZ_TIMEOUT_MS);
  let serverOk: boolean;
  try {
    serverOk = await probeServer(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
  const mode: EdgeAnnotationsMode = serverOk ? "server" : "client";
  writeSessionMode(mode);
  return mode;
}

/**
 * Auto-dispatching peer of `useEdgeAnnotations` / `useClientEdgeAnnotations`.
 * Probes `GET /healthz` for the `edge-annotations` feature on first build;
 * falls back to the client-side composable when the probe fails or when the
 * server fails post-decision (5xx / network / CORS), and sticks with the
 * client thereafter.
 *
 * Pin the transport explicitly via `VITE_GXWF_EDGE_ANNOTATIONS_MODE` (build
 * time) for static deploys that know the answer up front.
 */
export function useEdgeAnnotationsAuto() {
  const server = useEdgeAnnotations();
  const client = useClientEdgeAnnotations();
  const mode = ref<EdgeAnnotationsMode | null>(null);
  /**
   * Spans the *whole* build, including the probe + a server→client fallback.
   * Reading the inner composables' loadings would briefly flap to false in
   * the gap between server.build resolving (with an error) and client.build
   * starting.
   */
  const loading = ref(false);

  const annotations = computed(() => {
    if (mode.value === "server") return server.annotations.value;
    if (mode.value === "client") return client.annotations.value;
    return null;
  });

  const error = computed(() => {
    if (mode.value === "server") return server.error.value;
    if (mode.value === "client") return client.error.value;
    return null;
  });

  async function build(path: string): Promise<void> {
    loading.value = true;
    try {
      if (mode.value === null) {
        mode.value = await decideMode();
      }
      if (mode.value === "server") {
        await server.build(path);
        // Post-decision server failure (network/CORS/5xx): fall back to client and
        // stick. The user-facing build still finishes — the second composable
        // call populates annotations.
        if (server.error.value !== null) {
          mode.value = "client";
          writeSessionMode("client");
          await client.build(path);
        }
        return;
      }
      await client.build(path);
    } finally {
      loading.value = false;
    }
  }

  function clear(): void {
    server.clear();
    client.clear();
  }

  return {
    annotations,
    loading,
    error,
    build,
    clear,
    /** Active transport once `build` has run; null before. Useful for tests + UI badges. */
    mode,
    /** Client-side miss list — populated whenever the client transport is in use. */
    misses: client.misses,
    /** Client-side preload progress — populated whenever the client transport is in use. */
    progress: client.progress,
  };
}

/** Test-only helper to clear the cached transport decision. */
export function _resetEdgeAnnotationsAutoSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
