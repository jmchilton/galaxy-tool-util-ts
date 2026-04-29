import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageCalls: string[] = [];
const serviceConstructions: Array<{
  storageDbName: string;
  sources: Array<{ type: string; url: string }>;
  defaultToolshedUrl?: string;
}> = [];

vi.mock("@galaxy-tool-util/core", () => ({
  IndexedDBCacheStorage: class {
    constructor(public readonly dbName: string) {
      storageCalls.push(dbName);
    }
  },
  ToolInfoService: class {
    constructor(opts: {
      storage: { dbName: string };
      sources: Array<{ type: string; url: string }>;
      defaultToolshedUrl?: string;
    }) {
      serviceConstructions.push({
        storageDbName: opts.storage.dbName,
        sources: opts.sources.map((s) => ({ type: s.type, url: s.url })),
        defaultToolshedUrl: opts.defaultToolshedUrl,
      });
    }
  },
}));

import {
  _resetToolInfoServiceForTests,
  useToolInfoService,
} from "../../src/composables/useToolInfoService";

beforeEach(() => {
  storageCalls.length = 0;
  serviceConstructions.length = 0;
  _resetToolInfoServiceForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("useToolInfoService", () => {
  it("constructs with the default ToolShed when no env override is set", () => {
    useToolInfoService();
    expect(serviceConstructions).toHaveLength(1);
    expect(serviceConstructions[0]!.sources).toEqual([
      { type: "toolshed", url: "https://toolshed.g2.bx.psu.edu" },
    ]);
    expect(serviceConstructions[0]!.storageDbName).toBe("gxwf-ui:tool-cache");
  });

  it("returns the same instance across calls (singleton)", () => {
    const a = useToolInfoService();
    const b = useToolInfoService();
    expect(a).toBe(b);
    expect(serviceConstructions).toHaveLength(1);
  });

  it("places the proxy source ahead of ToolShed when configured", () => {
    useToolInfoService({ toolCacheProxyUrl: "http://localhost:8000" });
    expect(serviceConstructions[0]!.sources).toEqual([
      { type: "galaxy", url: "http://localhost:8000" },
      { type: "toolshed", url: "https://toolshed.g2.bx.psu.edu" },
    ]);
  });

  it("honors VITE_GXWF_TOOLSHED_URL + VITE_GXWF_CACHE_DB_NAME overrides", () => {
    vi.stubEnv("VITE_GXWF_TOOLSHED_URL", "https://shed.example.com");
    vi.stubEnv("VITE_GXWF_CACHE_DB_NAME", "test-db");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    useToolInfoService();

    expect(serviceConstructions[0]!.sources).toEqual([
      { type: "toolshed", url: "https://shed.example.com" },
    ]);
    expect(serviceConstructions[0]!.storageDbName).toBe("test-db");
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("does not warn when the default ToolShed is in use", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    useToolInfoService();
    expect(infoSpy).not.toHaveBeenCalled();
    infoSpy.mockRestore();
  });
});
