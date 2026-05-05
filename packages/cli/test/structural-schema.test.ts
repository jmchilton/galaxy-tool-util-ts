import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { runStructuralSchema } from "../src/commands/structural-schema.js";
import { createCliTestContext, type CliTestContext } from "./helpers/cli-test-context.js";

describe("gxwf structural-schema", () => {
  let ctx: CliTestContext;

  beforeEach(async () => {
    ctx = await createCliTestContext("structural-schema-test");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("generates format2 JSON Schema to stdout by default", async () => {
    await runStructuralSchema({});

    expect(process.exitCode).toBeUndefined();
    const output = ctx.stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const schema = JSON.parse(output);
    expect(schema).toHaveProperty("$schema");
    expect(schema).toHaveProperty("properties");
  });

  it("generates native JSON Schema with --format native", async () => {
    await runStructuralSchema({ format: "native" });

    expect(process.exitCode).toBeUndefined();
    const output = ctx.stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const schema = JSON.parse(output);
    expect(schema).toHaveProperty("$schema");
    expect(schema).toHaveProperty("properties");
  });

  it("writes to --output file", async () => {
    const outPath = join(ctx.tmpDir, "schema.json");
    await runStructuralSchema({ output: outPath });

    expect(process.exitCode).toBeUndefined();
    const raw = await readFile(outPath, "utf-8");
    const schema = JSON.parse(raw);
    expect(schema).toHaveProperty("$schema");
  });

  it("errors on unknown format", async () => {
    await runStructuralSchema({ format: "bad" });

    const errors = ctx.errSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(errors).toContain("Unknown format");
    expect(process.exitCode).toBe(1);
  });
});
