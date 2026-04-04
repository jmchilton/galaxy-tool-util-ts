/**
 * Tests for tree orchestrator infrastructure: discovery, loading, collection.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import {
  discoverWorkflows,
  loadWorkflowSafe,
  collectTree,
  summarizeOutcomes,
  skipWorkflow,
} from "../src/commands/tree.js";

let ctx: CliTestContext;

beforeEach(async () => {
  ctx = await createCliTestContext("tree");
});

afterEach(async () => {
  await ctx.cleanup();
});

// -- helpers --

const NATIVE_WF = JSON.stringify({
  a_galaxy_workflow: "true",
  format_version: "0.1",
  steps: {},
});

const FORMAT2_WF = `class: GalaxyWorkflow
steps: []
`;

const NOT_A_WF_JSON = JSON.stringify({ some: "data" });
const NOT_A_WF_YAML = "some: data\n";

async function writeFixture(dir: string, name: string, content: string): Promise<string> {
  const p = join(dir, name);
  await writeFile(p, content, "utf-8");
  return p;
}

// -- discoverWorkflows --

describe("discoverWorkflows", () => {
  it("finds .ga native workflows", async () => {
    await writeFixture(ctx.tmpDir, "wf.ga", NATIVE_WF);
    const found = await discoverWorkflows(ctx.tmpDir);
    expect(found).toHaveLength(1);
    expect(found[0].format).toBe("native");
    expect(found[0].relativePath).toBe("wf.ga");
  });

  it("finds .gxwf.yml format2 workflows", async () => {
    await writeFixture(ctx.tmpDir, "wf.gxwf.yml", FORMAT2_WF);
    const found = await discoverWorkflows(ctx.tmpDir);
    expect(found).toHaveLength(1);
    expect(found[0].format).toBe("format2");
  });

  it("skips non-workflow JSON files", async () => {
    await writeFixture(ctx.tmpDir, "data.json", NOT_A_WF_JSON);
    const found = await discoverWorkflows(ctx.tmpDir);
    expect(found).toHaveLength(0);
  });

  it("skips non-workflow YAML files", async () => {
    await writeFixture(ctx.tmpDir, "config.yml", NOT_A_WF_YAML);
    const found = await discoverWorkflows(ctx.tmpDir);
    expect(found).toHaveLength(0);
  });

  it("discovers workflows in subdirectories", async () => {
    const sub = join(ctx.tmpDir, "subdir");
    await mkdir(sub);
    await writeFixture(sub, "nested.ga", NATIVE_WF);
    const found = await discoverWorkflows(ctx.tmpDir);
    expect(found).toHaveLength(1);
    expect(found[0].relativePath).toBe(join("subdir", "nested.ga"));
  });

  it("skips .git directories", async () => {
    const git = join(ctx.tmpDir, ".git");
    await mkdir(git);
    await writeFixture(git, "wf.ga", NATIVE_WF);
    const found = await discoverWorkflows(ctx.tmpDir);
    expect(found).toHaveLength(0);
  });

  it("skips node_modules directories", async () => {
    const nm = join(ctx.tmpDir, "node_modules");
    await mkdir(nm);
    await writeFixture(nm, "wf.ga", NATIVE_WF);
    const found = await discoverWorkflows(ctx.tmpDir);
    expect(found).toHaveLength(0);
  });

  it("excludes format2 when includeFormat2=false", async () => {
    await writeFixture(ctx.tmpDir, "wf.ga", NATIVE_WF);
    await writeFixture(ctx.tmpDir, "wf.gxwf.yml", FORMAT2_WF);
    const found = await discoverWorkflows(ctx.tmpDir, false);
    expect(found).toHaveLength(1);
    expect(found[0].format).toBe("native");
  });

  it("sorts results by relative path", async () => {
    const a = join(ctx.tmpDir, "a");
    const b = join(ctx.tmpDir, "b");
    await mkdir(a);
    await mkdir(b);
    await writeFixture(b, "z.ga", NATIVE_WF);
    await writeFixture(a, "a.ga", NATIVE_WF);
    await writeFixture(ctx.tmpDir, "m.ga", NATIVE_WF);
    const found = await discoverWorkflows(ctx.tmpDir);
    expect(found.map((w) => w.relativePath)).toEqual([
      join("a", "a.ga"),
      join("b", "z.ga"),
      "m.ga",
    ]);
  });
});

// -- loadWorkflowSafe --

describe("loadWorkflowSafe", () => {
  it("loads native workflow", async () => {
    await writeFixture(ctx.tmpDir, "wf.ga", NATIVE_WF);
    const info = {
      path: join(ctx.tmpDir, "wf.ga"),
      relativePath: "wf.ga",
      format: "native" as const,
    };
    const data = await loadWorkflowSafe(info);
    expect(data).not.toBeNull();
    expect(data!.a_galaxy_workflow).toBe("true");
  });

  it("loads format2 workflow", async () => {
    await writeFixture(ctx.tmpDir, "wf.gxwf.yml", FORMAT2_WF);
    const info = {
      path: join(ctx.tmpDir, "wf.gxwf.yml"),
      relativePath: "wf.gxwf.yml",
      format: "format2" as const,
    };
    const data = await loadWorkflowSafe(info);
    expect(data).not.toBeNull();
    expect(data!.class).toBe("GalaxyWorkflow");
  });

  it("returns null for missing file", async () => {
    const info = {
      path: join(ctx.tmpDir, "nope.ga"),
      relativePath: "nope.ga",
      format: "native" as const,
    };
    const data = await loadWorkflowSafe(info);
    expect(data).toBeNull();
  });
});

// -- collectTree --

describe("collectTree", () => {
  it("collects results from processOne", async () => {
    await writeFixture(ctx.tmpDir, "a.ga", NATIVE_WF);
    await writeFixture(ctx.tmpDir, "b.gxwf.yml", FORMAT2_WF);

    const result = await collectTree(ctx.tmpDir, (info, _data) => {
      return { file: info.relativePath };
    });

    expect(result.root).toBe(ctx.tmpDir);
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes.every((o) => o.result !== undefined)).toBe(true);
  });

  it("captures errors from processOne", async () => {
    await writeFixture(ctx.tmpDir, "wf.ga", NATIVE_WF);

    const result = await collectTree(ctx.tmpDir, () => {
      throw new Error("boom");
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].error).toBe("boom");
  });

  it("captures skips via skipWorkflow()", async () => {
    await writeFixture(ctx.tmpDir, "wf.ga", NATIVE_WF);

    const result = await collectTree(ctx.tmpDir, () => {
      skipWorkflow("legacy encoding");
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].skipped).toBe(true);
    expect(result.outcomes[0].skipReason).toBe("legacy encoding");
  });
});

// -- summarizeOutcomes --

describe("summarizeOutcomes", () => {
  it("counts ok, fail, error, skipped", () => {
    const outcomes = [
      { info: {} as any, result: { ok: true } },
      { info: {} as any, result: { ok: false } },
      { info: {} as any, error: "bad" },
      { info: {} as any, skipped: true, skipReason: "x" },
    ];
    const summary = summarizeOutcomes(outcomes, (r) => !r.ok);
    expect(summary).toEqual({ total: 4, ok: 1, fail: 1, error: 1, skipped: 1 });
  });
});
