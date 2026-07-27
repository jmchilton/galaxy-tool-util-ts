import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import { runAddLocal } from "../src/commands/add-local.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

const SHED_ID = "toolshed.g2.bx.psu.edu/repos/devteam/cat/cat1";

/** Minimal valid tool XML (id + version), optionally dropping the version attr. */
function toolXml(opts: { version?: string } = {}): string {
  const ver = opts.version === undefined ? "" : ` version="${opts.version}"`;
  return `<tool id="cat1" name="Concatenate"${ver} profile="23.0"/>`;
}

describe("galaxy-tool-cache add-local", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("add-local-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function writeTool(name: string, xml: string): Promise<string> {
    const path = join(ctx.tmpDir, name);
    await writeFile(path, xml, "utf-8");
    return path;
  }

  const logged = (): string => ctx.logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
  const errored = (): string => ctx.errSpy.mock.calls.map((c) => c.join(" ")).join("\n");

  it("parses a local XML tool and caches it under the given --tool-id", async () => {
    const path = await writeTool("cat.xml", toolXml({ version: "1.0.0" }));

    await runAddLocal(path, { toolId: SHED_ID, cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBeUndefined();
    expect(logged()).toContain(`Cached ${SHED_ID} 1.0.0 from ${path}`);

    const cache = makeNodeToolCache({ cacheDir: ctx.tmpDir });
    expect(await cache.hasCached(SHED_ID, "1.0.0")).toBe(true);
  });

  it("parses a local YAML tool (dispatches on .yml extension)", async () => {
    const yml = ["class: GalaxyUserTool", "id: cat1", "name: Concatenate", "version: 2.0.0"].join(
      "\n",
    );
    const path = await writeTool("cat.yml", yml);

    await runAddLocal(path, { toolId: SHED_ID, cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBeUndefined();
    expect(logged()).toContain(`Cached ${SHED_ID} 2.0.0 from ${path}`);
    const cache = makeNodeToolCache({ cacheDir: ctx.tmpDir });
    expect(await cache.hasCached(SHED_ID, "2.0.0")).toBe(true);
  });

  it("lets --tool-version override the parsed version", async () => {
    const path = await writeTool("cat.xml", toolXml({ version: "1.0.0" }));

    await runAddLocal(path, { toolId: SHED_ID, toolVersion: "9.9.9", cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBeUndefined();
    expect(logged()).toContain(`Cached ${SHED_ID} 9.9.9 from ${path}`);
    const cache = makeNodeToolCache({ cacheDir: ctx.tmpDir });
    expect(await cache.hasCached(SHED_ID, "9.9.9")).toBe(true);
  });

  it("refuses without --tool-id even when the XML has an id, surfacing the parsed id", async () => {
    const path = await writeTool("cat.xml", toolXml({ version: "1.0.0" }));

    await runAddLocal(path, { cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBe(1);
    expect(logged()).toContain("Parsed tool: cat1 v1.0.0");
    expect(logged()).toContain("Use --tool-id");
    const cache = makeNodeToolCache({ cacheDir: ctx.tmpDir });
    expect(await cache.hasCached(SHED_ID, "1.0.0")).toBe(false);
  });

  it("errors when --tool-id is given but no version can be determined", async () => {
    const path = await writeTool("cat.xml", toolXml());

    await runAddLocal(path, { toolId: SHED_ID, cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBe(1);
    expect(errored()).toContain("Cannot determine version. Use --tool-version.");
  });

  it("errors when the file cannot be parsed as a tool", async () => {
    const path = await writeTool("broken.xml", "<toolbox></toolbox>");

    await runAddLocal(path, { toolId: SHED_ID, cacheDir: ctx.tmpDir });

    expect(process.exitCode).toBe(1);
    expect(errored()).toContain(`Failed to parse ${path}`);
  });
});
