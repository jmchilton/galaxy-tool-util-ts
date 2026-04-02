import { describe, it, expect } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, defaultConfig } from "../src/config.js";

describe("ServerConfig", () => {
  it("provides sensible defaults", () => {
    const config = defaultConfig();
    expect(config.port).toBe(8080);
    expect(config.host).toBe("127.0.0.1");
    expect(config["galaxy.workflows.toolSources"]).toEqual([]);
  });

  it("loads from YAML file", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "config-test-"));
    const configPath = join(tmpDir, "config.yml");
    await writeFile(
      configPath,
      `
galaxy.workflows.toolSources:
  - type: toolshed
    url: https://toolshed.g2.bx.psu.edu
    enabled: true
  - type: galaxy
    url: https://usegalaxy.org
    enabled: false
galaxy.workflows.toolCache:
  directory: /tmp/test-cache
port: 9090
`,
    );
    const config = await loadConfig(configPath);
    expect(config.port).toBe(9090);
    expect(config["galaxy.workflows.toolSources"]).toHaveLength(2);
    expect(config["galaxy.workflows.toolSources"][0].type).toBe("toolshed");
    expect(config["galaxy.workflows.toolSources"][1].enabled).toBe(false);
    expect(config["galaxy.workflows.toolCache"]?.directory).toBe("/tmp/test-cache");
    await rm(tmpDir, { recursive: true });
  });
});
