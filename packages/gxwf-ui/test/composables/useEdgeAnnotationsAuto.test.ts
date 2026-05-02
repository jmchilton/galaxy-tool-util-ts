import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const serverState = {
  annotations: ref<Map<string, unknown> | null>(null),
  loading: ref(false),
  error: ref<string | null>(null),
  build: vi.fn(),
  clear: vi.fn(),
};
const clientState = {
  annotations: ref<Map<string, unknown> | null>(null),
  loading: ref(false),
  error: ref<string | null>(null),
  misses: ref([]),
  progress: ref(null),
  build: vi.fn(),
  clear: vi.fn(),
};

vi.mock("../../src/composables/useEdgeAnnotations", () => ({
  useEdgeAnnotations: () => serverState,
}));
vi.mock("../../src/composables/useClientEdgeAnnotations", () => ({
  useClientEdgeAnnotations: () => clientState,
}));

import {
  _resetEdgeAnnotationsAutoSession,
  useEdgeAnnotationsAuto,
} from "../../src/composables/useEdgeAnnotationsAuto";

function resetServerClient() {
  serverState.annotations.value = null;
  serverState.loading.value = false;
  serverState.error.value = null;
  serverState.build.mockReset();
  serverState.clear.mockReset();
  clientState.annotations.value = null;
  clientState.loading.value = false;
  clientState.error.value = null;
  clientState.misses.value = [];
  clientState.progress.value = null;
  clientState.build.mockReset();
  clientState.clear.mockReset();
}

function stubSessionStorage() {
  const backing = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => backing.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => backing.set(key, value)),
    removeItem: vi.fn((key: string) => backing.delete(key)),
  };
  vi.stubGlobal("sessionStorage", storage);
  return storage;
}

beforeEach(() => {
  resetServerClient();
  _resetEdgeAnnotationsAutoSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("useEdgeAnnotationsAuto", () => {
  it("uses server when /healthz advertises edge-annotations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "ok", features: ["edge-annotations"] }), {
            status: 200,
          }),
      ),
    );

    const dispatcher = useEdgeAnnotationsAuto();
    serverState.build.mockImplementation(async () => {
      serverState.annotations.value = new Map([["k", { sourceStep: "x" }]]);
    });

    await dispatcher.build("wf.ga");

    expect(dispatcher.mode.value).toBe("server");
    expect(serverState.build).toHaveBeenCalledOnce();
    expect(clientState.build).not.toHaveBeenCalled();
    expect(dispatcher.annotations.value!.size).toBe(1);
  });

  it("falls back to client when /healthz fails (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("dns"))),
    );

    const dispatcher = useEdgeAnnotationsAuto();
    clientState.build.mockImplementation(async () => {
      clientState.annotations.value = new Map();
    });

    await dispatcher.build("wf.ga");

    expect(dispatcher.mode.value).toBe("client");
    expect(serverState.build).not.toHaveBeenCalled();
    expect(clientState.build).toHaveBeenCalledOnce();
  });

  it("falls back to client on post-decision server failure and sticks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "ok", features: ["edge-annotations"] }), {
            status: 200,
          }),
      ),
    );

    const dispatcher = useEdgeAnnotationsAuto();
    serverState.build.mockImplementation(async () => {
      serverState.error.value = "boom";
    });
    clientState.build.mockImplementation(async () => {
      clientState.annotations.value = new Map();
    });

    await dispatcher.build("wf.ga");

    // First build: server selected, server failed, client called.
    expect(serverState.build).toHaveBeenCalledOnce();
    expect(clientState.build).toHaveBeenCalledOnce();
    expect(dispatcher.mode.value).toBe("client");

    // Second build: stays on client without re-probing.
    serverState.build.mockClear();
    clientState.build.mockClear();
    await dispatcher.build("wf.ga");
    expect(serverState.build).not.toHaveBeenCalled();
    expect(clientState.build).toHaveBeenCalledOnce();
  });

  it("honors VITE_GXWF_EDGE_ANNOTATIONS_MODE=client without probing", async () => {
    vi.stubEnv("VITE_GXWF_EDGE_ANNOTATIONS_MODE", "client");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const dispatcher = useEdgeAnnotationsAuto();
    await dispatcher.build("wf.ga");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dispatcher.mode.value).toBe("client");
    expect(clientState.build).toHaveBeenCalledOnce();
  });

  it("propagates client error and clears annotations when both transports fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "ok", features: ["edge-annotations"] }), {
            status: 200,
          }),
      ),
    );

    const dispatcher = useEdgeAnnotationsAuto();
    serverState.build.mockImplementation(async () => {
      serverState.error.value = "server boom";
      serverState.annotations.value = null;
    });
    clientState.build.mockImplementation(async () => {
      clientState.error.value = "client boom";
      clientState.annotations.value = null;
    });

    await dispatcher.build("wf.ga");

    expect(dispatcher.mode.value).toBe("client");
    expect(dispatcher.error.value).toBe("client boom");
    expect(dispatcher.annotations.value).toBeNull();
    expect(dispatcher.loading.value).toBe(false);
  });

  it("loading stays true across the server→client fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "ok", features: ["edge-annotations"] }), {
            status: 200,
          }),
      ),
    );

    const dispatcher = useEdgeAnnotationsAuto();
    const seen: boolean[] = [];
    serverState.build.mockImplementation(async () => {
      seen.push(dispatcher.loading.value);
      serverState.error.value = "boom";
    });
    clientState.build.mockImplementation(async () => {
      seen.push(dispatcher.loading.value);
      clientState.annotations.value = new Map();
    });

    await dispatcher.build("wf.ga");

    expect(seen).toEqual([true, true]);
    expect(dispatcher.loading.value).toBe(false);
  });

  it("uses cached sessionStorage decision without re-probing", async () => {
    const storage = stubSessionStorage();
    storage.setItem("gxwf-ui:annotations-mode", "client");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const dispatcher = useEdgeAnnotationsAuto();
    await dispatcher.build("wf.ga");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dispatcher.mode.value).toBe("client");
  });
});
