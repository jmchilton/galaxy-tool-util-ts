/**
 * Mechanical port of Galaxy's
 * ``test/unit/tool_util/test_user_tool_source_validation.py``
 * (galaxyproject/galaxy#22615). When Galaxy externalizes the corpus as a
 * shared YAML file we should switch this file to consume that — see follow-up
 * issue.
 */
import { describe, it, expect } from "vitest";
import { validateUserToolSource } from "../src/user-tool-source/index.js";

const VALID_TOOL = {
  class: "GalaxyUserTool",
  id: "my-cool-tool",
  name: "My Cool Tool",
  version: "0.1.0",
  description: "A cool tool.",
  container: "quay.io/biocontainers/python:3.13",
  shell_command: "head -n '$(inputs.n_lines)' '$(inputs.data_input.path)' > out.txt",
  inputs: [
    { type: "integer", name: "n_lines" },
    { type: "data", name: "data_input" },
  ],
  outputs: [{ type: "data", name: "out", from_work_dir: "out.txt" }],
  citations: [{ type: "doi", content: "10.1234/abc.def" }],
};

function doc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(VALID_TOOL), ...overrides };
}

function flatten(errors: { path: string; message: string }[]): string {
  return errors.map((e) => `${e.path}: ${e.message}`).join(" | ");
}

function expectValid(d: Record<string, unknown>): void {
  const result = validateUserToolSource(d);
  expect(result.errors, `expected valid, got: ${flatten(result.errors)}`).toEqual([]);
  expect(result.valid).toBe(true);
}

function expectErrorContains(d: Record<string, unknown>, needle: string): void {
  const result = validateUserToolSource(d);
  expect(result.valid).toBe(false);
  const flat = flatten(result.errors);
  expect(flat, `expected substring ${JSON.stringify(needle)} in errors:\n${flat}`).toContain(
    needle,
  );
}

describe("UserToolSource validator — mirror of test_user_tool_source_validation.py", () => {
  it("happy path", () => {
    expectValid(VALID_TOOL);
  });

  it("hyphenated id is accepted", () => {
    expectValid(doc({ id: "with-hyphens-and_underscores" }));
  });

  it.each([
    ["My-Tool"],
    ["1starts_with_digit"],
    ["has space"],
    ["trailing!"],
    ["_leading_underscore"],
  ])("invalid id rejected: %s", (badId) => {
    expectErrorContains(doc({ id: badId }), "must match pattern");
  });

  it.each([[""], ["   "]])("blank container rejected: %j", (badContainer) => {
    // Empty string is caught by JSON Schema (minLength implicit via pattern? actually
    // no — pre-22615 it was permissive; with 22615 the field_validator catches blank.
    // Either path emits a diagnostic; assert on substring shared by both.
    expectErrorContains(doc({ container: badContainer }), "container");
  });

  it("blank name rejected (long enough to clear minLength=5)", () => {
    expectErrorContains(doc({ name: "       " }), "must not be empty or whitespace");
  });

  it("undeclared inputs ref in shell_command", () => {
    expectErrorContains(doc({ shell_command: "echo $(inputs.foo)" }), "inputs.foo");
  });

  it("conditional top-level name resolves for nested ref", () => {
    expectValid(
      doc({
        shell_command: "echo $(inputs.cond.test_parameter) > out.txt",
        inputs: [
          {
            type: "conditional",
            name: "cond",
            test_parameter: { type: "boolean", name: "test_parameter" },
            whens: [
              { discriminator: true, parameters: [] },
              { discriminator: false, parameters: [] },
            ],
          },
        ],
      }),
    );
  });

  it("repeat and section top-level names resolve", () => {
    expectValid(
      doc({
        shell_command: "echo $(inputs.my_repeat[0].x) $(inputs.my_section.y) > out.txt",
        inputs: [
          { type: "repeat", name: "my_repeat", parameters: [] },
          { type: "section", name: "my_section", parameters: [] },
        ],
      }),
    );
  });

  it("undeclared inputs ref in configfile", () => {
    expectErrorContains(
      doc({
        configfiles: [
          {
            name: "script",
            filename: "script.sh",
            content: "echo $(inputs.unknown)",
            eval_engine: "ecmascript",
          },
        ],
      }),
      "inputs.unknown",
    );
  });

  it("data output without from_work_dir or discovery rejected", () => {
    expectErrorContains(doc({ outputs: [{ type: "data", name: "out" }] }), "from_work_dir");
  });

  it("collection output without discover rejected", () => {
    expectErrorContains(
      doc({
        outputs: [
          {
            type: "collection",
            name: "outs",
            structure: { collection_type: "list" },
          },
        ],
      }),
      "discover_datasets",
    );
  });

  it("invalid DOI citation rejected", () => {
    expectErrorContains(doc({ citations: [{ type: "doi", content: "not-a-doi" }] }), "DOI");
  });

  it("invalid bibtex citation rejected", () => {
    expectErrorContains(
      doc({ citations: [{ type: "bibtex", content: "no leading at-sign" }] }),
      "bibtex",
    );
  });

  it("unknown-type citation with DOI content accepted", () => {
    expectValid(doc({ citations: [{ type: "reference", content: "10.1234/abc.def" }] }));
  });

  it("no citations accepted", () => {
    expectValid(doc({ citations: null }));
  });

  it("schemaOnly skips semantic checks", () => {
    const result = validateUserToolSource(doc({ shell_command: "echo $(inputs.foo)" }), {
      schemaOnly: true,
    });
    expect(result.valid).toBe(true);
  });
});
