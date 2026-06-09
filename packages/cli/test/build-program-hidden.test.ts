/**
 * Verifies that `SpecCommand.hidden: true` suppresses the command from
 * commander's --help output while keeping it invocable.
 */
import { describe, it, expect } from "vitest";
import { buildProgramFromSpec } from "../src/spec/build-program.js";
import type { ProgramSpec } from "../src/meta/spec-types.js";

const spec: ProgramSpec = {
  name: "demo",
  description: "test spec",
  version: "0.0.0",
  commands: [
    {
      name: "visible-cmd",
      description: "shown in help",
      handler: "v",
    },
    {
      name: "_hidden-cmd",
      description: "should be hidden from help",
      handler: "h",
      hidden: true,
    },
  ],
};

const handlers = {
  v: (): void => {},
  h: (): void => {},
};

describe("buildProgramFromSpec hidden command support", () => {
  it("omits hidden commands from --help output", () => {
    const program = buildProgramFromSpec(spec, handlers);
    const help = program.helpInformation();
    expect(help).toContain("visible-cmd");
    expect(help).not.toContain("_hidden-cmd");
  });

  it("still registers the hidden command as a runnable subcommand", () => {
    const program = buildProgramFromSpec(spec, handlers);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("_hidden-cmd");
  });

  it("leaves visible commands visible in help when hidden is omitted", () => {
    const visibleOnly: ProgramSpec = {
      name: "demo2",
      description: "test spec",
      version: "0.0.0",
      commands: [{ name: "shown", description: "no hidden flag", handler: "v" }],
    };
    const program = buildProgramFromSpec(visibleOnly, handlers);
    expect(program.helpInformation()).toContain("shown");
  });
});

describe("buildProgramFromSpec reserved-flag guard", () => {
  const reservedSpec = (flags: string): ProgramSpec => ({
    name: "demo",
    description: "test spec",
    version: "0.0.0",
    commands: [
      { name: "add", description: "add", handler: "v", options: [{ flags, description: "x" }] },
    ],
  });

  it("rejects a --version data option (collides with commander's version flag)", () => {
    expect(() => buildProgramFromSpec(reservedSpec("--version <ver>"), handlers)).toThrow(
      /collides with commander's built-in --version flag/,
    );
  });

  it("rejects a --help data option (collides with commander's help flag)", () => {
    expect(() => buildProgramFromSpec(reservedSpec("--help"), handlers)).toThrow(
      /collides with commander's built-in --help flag/,
    );
  });

  it("allows --tool-version", () => {
    expect(() =>
      buildProgramFromSpec(reservedSpec("--tool-version <ver>"), handlers),
    ).not.toThrow();
  });
});
