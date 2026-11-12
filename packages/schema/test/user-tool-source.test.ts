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
      doc({ outputs: [{ type: "collection", name: "outs", collection_type: "list" }] }),
      "discover_datasets",
    );
  });

  it("flat collection output with pattern-only discover accepted", () => {
    expectValid(
      doc({
        outputs: [
          {
            type: "collection",
            name: "outs",
            collection_type: "list",
            discover_datasets: [{ pattern: "*.txt" }],
          },
        ],
      }),
    );
  });

  it("collection discover typo rejected", () => {
    expectErrorContains(
      doc({
        outputs: [
          {
            type: "collection",
            name: "outs",
            collection_type: "list",
            discover_datasets: [{ patern: "*.txt" }],
          },
        ],
      }),
      "must NOT have additional properties",
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

  it("security checks are opt-in", () => {
    const unsafe = doc({
      shell_command: "printf '%s' '$(inputs.label)' > out.txt",
      inputs: [{ type: "text", name: "label" }],
    });
    expect(validateUserToolSource(unsafe).valid).toBe(true);
    const result = validateUserToolSource(unsafe, { security: true });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "/shell_command",
      keyword: "dynamic_tool.unsafe_text_interpolation",
      message:
        "free-text input 'inputs.label' is substituted as executable text; serialize it into a config file with JSON.stringify and read it as data",
      params: { input: "label" },
    });
  });

  it("security accepts serialized text in a data config", () => {
    const result = validateUserToolSource(
      doc({
        shell_command: "python script.py params.json > out.txt",
        inputs: [{ type: "text", name: "label" }],
        configfiles: [
          {
            name: "params",
            filename: "params.json",
            content: '{"label": $(JSON.stringify(inputs.label))}',
            eval_engine: "ecmascript",
          },
          {
            name: "script",
            filename: "script.py",
            content: "import json\nprint(json.load(open('params.json'))['label'])",
            eval_engine: "ecmascript",
          },
        ],
      }),
      { security: true },
    );
    expect(result.valid, flatten(result.errors)).toBe(true);
  });

  it("security rejects direct text in an executable config", () => {
    const result = validateUserToolSource(
      doc({
        shell_command: "python script.py > out.txt",
        inputs: [{ type: "text", name: "label" }],
        configfiles: [
          {
            name: "script",
            filename: "script.py",
            content: "print('$(inputs.label)')",
            eval_engine: "ecmascript",
          },
        ],
      }),
      { security: true },
    );
    expect(result.errors[0]?.path).toBe("/configfiles/0/content");
    expect(result.errors[0]?.keyword).toBe("dynamic_tool.unsafe_text_interpolation");
  });

  it("security ignores typed values and non-executable configs", () => {
    const result = validateUserToolSource(
      doc({
        shell_command: "head -n $(inputs.count) params.txt > out.txt",
        inputs: [
          { type: "integer", name: "count" },
          { type: "text", name: "label" },
        ],
        configfiles: [
          {
            name: "params",
            filename: "params.txt",
            content: "$(inputs.label)",
            eval_engine: "ecmascript",
          },
        ],
      }),
      { security: true },
    );
    expect(result.valid, flatten(result.errors)).toBe(true);
  });
});
