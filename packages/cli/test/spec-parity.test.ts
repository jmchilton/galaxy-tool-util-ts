/**
 * Parity oracle for the spec→commander migration (issue #87).
 *
 * Asserts that commands declared in `spec/*.yml` produce the same
 * `CliCommandSpec` (via the meta walker) as the live in-code commander
 * builders in `src/programs/*.ts`. Once every command is in the YAML,
 * the in-code builders disappear and this test goes with them.
 */
import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractProgram } from "../src/meta-build.js";
import { buildGxwfProgram } from "../src/programs/gxwf.js";
import { buildGalaxyToolCacheProgram } from "../src/programs/galaxy-tool-cache.js";
import { buildProgramFromSpec } from "../src/spec/build-program.js";
import { extractProgramFromSpec } from "../src/meta/extract-spec.js";
import type { ProgramSpec } from "../src/meta/spec-types.js";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specDir = join(__dirname, "..", "spec");
const loadSpec = (name: string): ProgramSpec =>
  JSON.parse(readFileSync(join(specDir, name), "utf8")) as ProgramSpec;

const noopHandler = (): void => {
  /* parity test only walks structure */
};

/** Auto-supply a noop handler for any name the spec asks for. */
const allNoopHandlers = new Proxy({} as Record<string, () => void>, {
  get: () => noopHandler,
  has: () => true,
});

const programs = [
  { label: "gxwf", specFile: "gxwf.json", build: buildGxwfProgram },
  {
    label: "galaxy-tool-cache",
    specFile: "galaxy-tool-cache.json",
    build: buildGalaxyToolCacheProgram,
  },
] as const;

for (const { label, specFile, build } of programs) {
  describe(`${label} spec parity`, () => {
    const inCode = extractProgram(build());
    const spec = loadSpec(specFile);
    const fromSpec = extractProgram(buildProgramFromSpec(spec, allNoopHandlers));
    const directExtract = extractProgramFromSpec(spec);

    it("program-level metadata matches", () => {
      expect(fromSpec.name).toBe(inCode.name);
      expect(fromSpec.description).toBe(inCode.description);
      expect(fromSpec.version).toBe(inCode.version);
    });

    for (const specCmd of spec.commands) {
      it(`command "${specCmd.name}" matches in-code definition`, () => {
        const live = inCode.commands.find((c) => c.name === specCmd.name);
        const built = fromSpec.commands.find((c) => c.name === specCmd.name);
        expect(live, `in-code program missing "${specCmd.name}"`).toBeDefined();
        expect(built, `spec-built program missing "${specCmd.name}"`).toBeDefined();
        expect(built).toEqual(live);
      });

      it(`command "${specCmd.name}" extracts directly without commander`, () => {
        const viaCommander = fromSpec.commands.find((c) => c.name === specCmd.name);
        const direct = directExtract.commands.find((c) => c.name === specCmd.name);
        expect(direct).toEqual(viaCommander);
      });
    }
  });
}

describe("spec validation", () => {
  const base: ProgramSpec = {
    name: "x",
    description: "x",
    version: "0",
    commands: [{ name: "a", description: "a", handler: "a" }],
  };

  it("rejects unknown handler", () => {
    expect(() => buildProgramFromSpec(base, {})).toThrow(/Missing handler "a"/);
  });

  it("rejects duplicate command names", () => {
    const spec: ProgramSpec = {
      ...base,
      commands: [
        { name: "a", description: "a", handler: "a" },
        { name: "a", description: "a", handler: "a" },
      ],
    };
    expect(() => buildProgramFromSpec(spec, { a: noopHandler })).toThrow(/Duplicate command "a"/);
  });

  it("rejects duplicate options on a command", () => {
    const spec: ProgramSpec = {
      ...base,
      commands: [
        {
          name: "a",
          description: "a",
          handler: "a",
          options: [
            { flags: "--foo <x>", description: "" },
            { flags: "--foo <y>", description: "" },
          ],
        },
      ],
    };
    expect(() => buildProgramFromSpec(spec, { a: noopHandler })).toThrow(/Duplicate option "foo"/);
  });

  it("rejects unknown optionGroup ref", () => {
    const spec: ProgramSpec = {
      ...base,
      commands: [{ name: "a", description: "a", handler: "a", optionGroups: ["nope"] }],
    };
    expect(() => buildProgramFromSpec(spec, { a: noopHandler })).toThrow(
      /unknown optionGroup "nope"/,
    );
  });
});
