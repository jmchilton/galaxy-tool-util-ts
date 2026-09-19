/**
 * A boolean option may declare both `--foo` and `--no-foo`. They share one
 * commander attribute name, so the spec's duplicate check has to tell the two
 * senses apart — and the resulting attribute must stay tri-state: `undefined`
 * when neither flag is passed, so a handler can distinguish "not asked" from
 * "asked for off".
 */
import { describe, it, expect } from "vitest";
import { buildProgramFromSpec } from "../src/spec/build-program.js";
import type { ProgramSpec } from "../src/meta/spec-types.js";

const spec: ProgramSpec = {
  name: "demo",
  description: "test spec",
  version: "9.9.9",
  commands: [
    {
      name: "convert",
      description: "convert a workflow",
      handler: "convert",
      args: [{ raw: "<file>", description: "Workflow file" }],
      options: [
        { flags: "--stateful", description: "Force state-aware conversion" },
        { flags: "--no-stateful", description: "Skip state-aware conversion" },
      ],
    },
  ],
};

async function parseStateful(argv: string[]): Promise<boolean | undefined> {
  let captured: boolean | undefined;
  let called = false;
  const handlers = {
    convert: (_file: string, opts: { stateful?: boolean }): void => {
      captured = opts.stateful;
      called = true;
    },
  };
  const program = buildProgramFromSpec(spec, handlers);
  await program.parseAsync(["node", "demo", "convert", "wf.ga", ...argv]);
  expect(called).toBe(true);
  return captured;
}

describe("negatable boolean options", () => {
  it("accepts a --foo / --no-foo pair without tripping the duplicate check", () => {
    expect(() => buildProgramFromSpec(spec, { convert: () => {} })).not.toThrow();
  });

  it("leaves the attribute undefined when neither flag is passed", async () => {
    expect(await parseStateful([])).toBeUndefined();
  });

  it("resolves --stateful to true and --no-stateful to false", async () => {
    expect(await parseStateful(["--stateful"])).toBe(true);
    expect(await parseStateful(["--no-stateful"])).toBe(false);
  });

  it("still rejects a genuinely duplicated flag", () => {
    const dup: ProgramSpec = {
      ...spec,
      commands: [
        {
          ...spec.commands[0],
          options: [
            { flags: "--stateful", description: "one" },
            { flags: "--stateful", description: "two" },
          ],
        },
      ],
    };
    expect(() => buildProgramFromSpec(dup, { convert: () => {} })).toThrow(/Duplicate option/);
  });
});
