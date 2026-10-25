import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as YAML from "yaml";

import { runFillDefaults } from "../src/commands/fill-defaults.js";
import { runValidateWorkflow } from "../src/commands/validate-workflow.js";
import { runLint } from "../src/commands/lint.js";
import { runDraftValidate } from "../src/commands/draft-validate.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";
import { seedAllTools, COMPOSE_TOOL_ID } from "./helpers/fixtures.js";

const condWorkflow = (state: Record<string, unknown>) => ({
  class: "GalaxyWorkflow",
  inputs: { text: "string" },
  outputs: {},
  steps: {
    compose: {
      tool_id: COMPOSE_TOOL_ID,
      tool_version: "1.0",
      in: { "param_type|component_value": "text" },
      state,
    },
  },
});

const allOutput = (ctx: CliTestContext) =>
  [...ctx.logSpy.mock.calls, ...ctx.errSpy.mock.calls].map((c) => String(c[0])).join("\n");

describe("conditional completeness", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("fill-defaults");
    await seedAllTools(ctx.tmpDir);
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  async function writeWf(state: Record<string, unknown>): Promise<string> {
    const wfPath = join(ctx.tmpDir, "wf.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(condWorkflow(state)));
    return wfPath;
  }

  it("validate --strict-state rejects a conditional missing its test parameter", async () => {
    const wfPath = await writeWf({ param_type: {} });
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, offline: true, strictState: true });
    expect(process.exitCode).toBe(1);
    expect(allOutput(ctx)).toContain(
      "param_type: missing conditional test parameter 'select_param_type'",
    );
  });

  it("validate --mode json-schema --strict-state rejects a missing test parameter", async () => {
    const wfPath = await writeWf({ param_type: {} });
    await runValidateWorkflow(wfPath, {
      cacheDir: ctx.tmpDir,
      mode: "json-schema",
      strictState: true,
    });
    expect(process.exitCode).toBe(1);
    expect(allOutput(ctx)).toContain("missing conditional test parameter 'select_param_type'");
  });

  it("lint --strict-state rejects a missing test parameter", async () => {
    const wfPath = await writeWf({ param_type: {} });
    await runLint(wfPath, { cacheDir: ctx.tmpDir, offline: true, strictState: true });
    expect(process.exitCode).toBe(2);
  });

  it("draft-validate --strict-state rejects a missing test parameter", async () => {
    const wfPath = join(ctx.tmpDir, "wf.gxwf.yml");
    const draft = { ...condWorkflow({ param_type: {} }), class: "GalaxyWorkflowDraft" };
    await writeFile(wfPath, YAML.stringify(draft));
    await runDraftValidate(wfPath, {
      cacheDir: ctx.tmpDir,
      offline: true,
      concrete: true,
      strictState: true,
    });
    expect(process.exitCode).not.toBe(0);
    expect(allOutput(ctx)).toContain("missing conditional test parameter 'select_param_type'");
  });

  it("validate without --strict-state still accepts partial state", async () => {
    const wfPath = await writeWf({ param_type: {} });
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, offline: true });
    expect(process.exitCode).toBe(0);
  });

  it("fill-defaults output passes validate --strict-state and keeps connections", async () => {
    const wfPath = await writeWf({});
    const outPath = join(ctx.tmpDir, "filled.gxwf.yml");
    await runFillDefaults(wfPath, { cacheDir: ctx.tmpDir, offline: true, output: outPath });
    const filled = YAML.parse(await readFile(outPath, "utf-8"));
    expect(filled.steps.compose.state).toEqual({ param_type: { select_param_type: "text" } });
    expect(filled.steps.compose.in).toEqual({ "param_type|component_value": "text" });

    process.exitCode = undefined;
    await runValidateWorkflow(outPath, { cacheDir: ctx.tmpDir, offline: true, strictState: true });
    expect(process.exitCode).toBe(0);
  });
});

describe("fill-defaults edge cases", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("fill-defaults-edge");
    await seedAllTools(ctx.tmpDir);
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  const write = async (name: string, wf: unknown) => {
    const p = join(ctx.tmpDir, name);
    await writeFile(p, name.endsWith(".ga") ? JSON.stringify(wf) : YAML.stringify(wf));
    return p;
  };

  it("connected test parameter is not flagged and stays absent", async () => {
    const wf = condWorkflow({});
    wf.steps.compose.in = {
      "param_type|select_param_type": "text",
      "param_type|component_value": "text",
    } as any;
    const wfPath = await write("wf.gxwf.yml", wf);
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, offline: true, strictState: true });
    expect(allOutput(ctx)).not.toContain("missing conditional test parameter");

    const outPath = join(ctx.tmpDir, "out.gxwf.yml");
    await runFillDefaults(wfPath, { cacheDir: ctx.tmpDir, offline: true, output: outPath });
    const filled = YAML.parse(await readFile(outPath, "utf-8"));
    expect(filled.steps.compose.state.param_type?.select_param_type).toBeUndefined();
  });

  it("flags a missing test parameter inside a subworkflow", async () => {
    const wf = {
      class: "GalaxyWorkflow",
      inputs: {},
      outputs: {},
      steps: { sub: { run: { ...condWorkflow({ param_type: {} }), inputs: { text: "string" } } } },
    };
    const wfPath = await write("sub.gxwf.yml", wf);
    await runValidateWorkflow(wfPath, { cacheDir: ctx.tmpDir, offline: true, strictState: true });
    expect(process.exitCode).toBe(1);
    expect(allOutput(ctx)).toContain(
      "param_type: missing conditional test parameter 'select_param_type'",
    );
  });

  it("fills native tool_state and keeps input_connections", async () => {
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": { id: 0, type: "data_input", tool_id: null, tool_state: {}, input_connections: {} },
        "1": {
          id: 1,
          type: "tool",
          tool_id: COMPOSE_TOOL_ID,
          tool_version: "1.0",
          tool_state: {},
          input_connections: { "param_type|component_value": { id: 0, output_name: "output" } },
        },
      },
    };
    const wfPath = await write("wf.ga", wf);
    const outPath = join(ctx.tmpDir, "out.ga");
    await runFillDefaults(wfPath, { cacheDir: ctx.tmpDir, offline: true, output: outPath });
    const filled = JSON.parse(await readFile(outPath, "utf-8"));
    expect(filled.steps["1"].tool_state).toEqual({ param_type: { select_param_type: "text" } });
    expect(filled.steps["1"].input_connections).toEqual(wf.steps["1"].input_connections);
    expect(allOutput(ctx)).toContain("Filled defaults on 1 step(s)");
  });

  it("does not count already-complete steps as filled", async () => {
    const wfPath = await write(
      "wf.gxwf.yml",
      condWorkflow({ param_type: { select_param_type: "text" } }),
    );
    await runFillDefaults(wfPath, {
      cacheDir: ctx.tmpDir,
      offline: true,
      output: join(ctx.tmpDir, "o.yml"),
    });
    expect(allOutput(ctx)).toContain("Filled defaults on 0 step(s)");
  });

  it("warns on JSON-string tool_state and non-inline subworkflows", async () => {
    const wf = {
      a_galaxy_workflow: "true",
      "format-version": "0.1",
      steps: {
        "0": {
          id: 0,
          type: "tool",
          tool_id: COMPOSE_TOOL_ID,
          tool_version: "1.0",
          tool_state: "{}",
          input_connections: {},
        },
        "1": { id: 1, type: "subworkflow", input_connections: {} },
      },
    };
    const wfPath = await write("wf.ga", wf);
    await runFillDefaults(wfPath, {
      cacheDir: ctx.tmpDir,
      offline: true,
      output: join(ctx.tmpDir, "o.ga"),
    });
    const out = allOutput(ctx);
    expect(out).toContain("step 0: tool_state is a JSON string");
    expect(out).toContain("step 1: subworkflow not inline");
  });
});

describe("fill-defaults format2 shapes", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("fill-defaults-f2");
    await seedAllTools(ctx.tmpDir);
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("warns on JSON-string format2 tool_state and leaves it unchanged", async () => {
    const wf = condWorkflow({}) as any;
    delete wf.steps.compose.state;
    wf.steps.compose.tool_state = '{"param_type": {"select_param_type": "text"}}';
    const wfPath = join(ctx.tmpDir, "wf.gxwf.yml");
    await writeFile(wfPath, YAML.stringify(wf));
    const outPath = join(ctx.tmpDir, "out.gxwf.yml");
    await runFillDefaults(wfPath, { cacheDir: ctx.tmpDir, offline: true, output: outPath });
    const filled = YAML.parse(await readFile(outPath, "utf-8"));
    expect(filled.steps.compose.tool_state).toBe(wf.steps.compose.tool_state);
    expect(allOutput(ctx)).toContain("step compose: tool_state is a JSON string");
  });

  it("fills every $graph entry", async () => {
    const main = { ...condWorkflow({}), id: "main" };
    const wfPath = join(ctx.tmpDir, "graph.gxwf.yml");
    await writeFile(wfPath, YAML.stringify({ $graph: [main] }));
    const outPath = join(ctx.tmpDir, "out.gxwf.yml");
    await runFillDefaults(wfPath, { cacheDir: ctx.tmpDir, offline: true, output: outPath });
    const filled = YAML.parse(await readFile(outPath, "utf-8"));
    expect(filled.$graph[0].steps.compose.state.param_type.select_param_type).toBe("text");
    expect(allOutput(ctx)).toContain("Filled defaults on 1 step(s)");
  });
});
