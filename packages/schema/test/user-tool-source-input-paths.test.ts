import { describe, it, expect } from "vitest";
import { validateUserToolSource } from "../src/user-tool-source/index.js";

function tool(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    class: "GalaxyUserTool",
    id: "input-paths",
    name: "Input paths",
    version: "0.1.0",
    container: "busybox",
    shell_command: "true",
    inputs: [],
    outputs: [{ type: "data", name: "out", from_work_dir: "out.txt" }],
    ...overrides,
  };
}

function pathErrors(doc: Record<string, unknown>): string[] {
  return validateUserToolSource(doc)
    .errors.filter((e) => e.keyword === "input_path")
    .map((e) => `${e.path}: ${e.message}`);
}

const READS = { name: "reads", type: "data_collection", collection_type: "paired_or_unpaired" };

describe("inputs.* member paths in UDT templates", () => {
  it("flags the egapx star_wnode configfile that reads paired_or_unpaired elements off the collection", () => {
    const errors = pathErrors(
      tool({
        inputs: [READS],
        configfiles: [
          {
            name: "reads",
            filename: "reads.sh",
            content:
              "set -- $(inputs.reads.unpaired ? `'${inputs.reads.unpaired.path}'` : `'${inputs.reads.forward.path}' '${inputs.reads.reverse.path}'`)\n",
          },
        ],
      }),
    );
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain("/configfiles/0/content");
    expect(errors[0]).toContain(
      "inputs.reads.unpaired: data_collection input 'reads' (paired_or_unpaired) has no field 'unpaired' at job runtime",
    );
    expect(errors[0]).toContain("Use inputs.reads.elements.unpaired.");
    expect(errors.join("\n")).toContain("inputs.reads.forward:");
    expect(errors.join("\n")).toContain("inputs.reads.reverse:");
  });

  it("accepts the runtime form of the same configfile", () => {
    expect(
      pathErrors(
        tool({
          inputs: [READS],
          configfiles: [
            {
              content:
                "set -- $(inputs.reads.has_single_item ? `'${inputs.reads.elements.unpaired.path}'` : `'${inputs.reads.elements.forward.path}' '${inputs.reads.elements.reverse.path}'`)",
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("checks ${...} function bodies in shell_command", () => {
    const errors = pathErrors(
      tool({
        inputs: [{ name: "input", type: "data" }],
        shell_command: "${ var p = inputs.input.filepath; return 'cat ' + p; } > out.txt",
      }),
    );
    expect(errors).toEqual([
      expect.stringContaining(
        "/shell_command: Value error, inputs.input.filepath: data input 'input' has no field 'filepath' at job runtime",
      ),
    ]);
  });

  it("accepts dataset fields, string methods at the leaf and bracket access", () => {
    expect(
      pathErrors(
        tool({
          inputs: [{ name: "input", type: "data" }],
          shell_command:
            "cp '$(inputs.input.path)' '$(inputs.input.nameroot.replace(/\\./g, '_'))$(inputs.input['nameext'])' && echo $(inputs.input.size.toFixed(0)) $(inputs.input.basename.length)",
        }),
      ),
    ).toEqual([]);
  });

  it("flags a member read off a string field", () => {
    expect(
      pathErrors(
        tool({
          inputs: [{ name: "input", type: "data" }],
          shell_command: "cat $(inputs.input.path.file)",
        }),
      ),
    ).toEqual([
      expect.stringContaining(
        "inputs.input.path.file: inputs.input.path is a string at job runtime and has no field 'file'",
      ),
    ]);
  });

  it("flags members on scalars", () => {
    expect(
      pathErrors(
        tool({
          inputs: [{ name: "n", type: "integer" }],
          shell_command: "head -n $(inputs.n.value) $(inputs.n.toString())",
        }),
      ),
    ).toEqual([
      expect.stringContaining("inputs.n is a number at job runtime and has no field 'value'"),
    ]);
  });

  it("walks paired elements and their fields", () => {
    const doc = (cmd: string) =>
      tool({
        inputs: [{ name: "pair", type: "data_collection", collection_type: "paired" }],
        shell_command: cmd,
      });
    expect(pathErrors(doc("cat $(inputs.pair.elements.forward.path) $(inputs.pair.name)"))).toEqual(
      [],
    );
    expect(pathErrors(doc("cat $(inputs.pair.elements.unpaired.path)"))).toEqual([
      expect.stringContaining(
        "inputs.pair.elements.unpaired: the elements of a paired collection has no element 'unpaired' (elements: forward, reverse)",
      ),
    ]);
    expect(pathErrors(doc("cat $(inputs.pair.elements.forward.filename)"))).toEqual([
      expect.stringContaining(
        "inputs.pair.elements.forward.filename: a collection element has no field 'filename'",
      ),
    ]);
  });

  it("walks list and nested list:paired elements", () => {
    const doc = (cmd: string) =>
      tool({
        inputs: [{ name: "samples", type: "data_collection", collection_type: "list:paired" }],
        shell_command: cmd,
      });
    expect(
      pathErrors(
        doc(
          "${ return inputs.samples.elements.map((s) => s.name + ' ' + s.elements.forward.path).join(' ') + ' ' + inputs.samples.elements[0].elements.reverse.path + ' ' + inputs.samples.elements.length; }",
        ),
      ),
    ).toEqual([]);
    expect(pathErrors(doc("cat $(inputs.samples.elements[0].forward.path)"))).toEqual([
      expect.stringContaining(
        "inputs.samples.elements[0].forward: a nested paired collection has no field 'forward' at job runtime",
      ),
    ]);
    expect(pathErrors(doc("cat $(inputs.samples.elements.path)"))).toEqual([
      expect.stringContaining(
        "inputs.samples.elements.path: the elements of a list collection is an array at job runtime and has no field 'path'",
      ),
    ]);
  });

  it("treats multiple data as an array of datasets", () => {
    const doc = (cmd: string) =>
      tool({ inputs: [{ name: "files", type: "data", multiple: true }], shell_command: cmd });
    expect(pathErrors(doc("cat $(inputs.files.map((f) => f.path).join(' '))"))).toEqual([]);
    expect(pathErrors(doc("cat $(inputs.files[0].path)"))).toEqual([]);
    expect(pathErrors(doc("cat $(inputs.files.path)"))).toEqual([
      expect.stringContaining(
        "inputs.files.path: multiple data input 'files' is an array at job runtime and has no field 'path'",
      ),
    ]);
  });

  it("resolves through conditionals and repeats", () => {
    const doc = (cmd: string) =>
      tool({
        inputs: [
          {
            name: "mode",
            type: "conditional",
            test_parameter: {
              name: "kind",
              type: "select",
              options: [
                { value: "a", label: "A" },
                { value: "b", label: "B" },
              ],
            },
            whens: [
              { discriminator: "a", parameters: [{ name: "alpha", type: "integer" }] },
              { discriminator: "b", parameters: [{ name: "beta", type: "data" }] },
            ],
          },
          { name: "extra", type: "repeat", parameters: [{ name: "file", type: "data" }] },
        ],
        shell_command: cmd,
      });
    expect(
      pathErrors(
        doc(
          "x $(inputs.mode.kind) $(inputs.mode.alpha) $(inputs.mode.beta.path) $(inputs.extra.map((e) => e.file.path).join(' '))",
        ),
      ),
    ).toEqual([]);
    const errors = pathErrors(doc("x $(inputs.mode.gamma) $(inputs.extra[0].dataset)"));
    expect(errors).toEqual([
      expect.stringContaining("inputs.mode.gamma: conditional 'mode' has no field 'gamma'"),
      expect.stringContaining(
        "inputs.extra[0].dataset: a block of repeat 'extra' has no field 'dataset'",
      ),
    ]);
  });

  it("skips what it can't resolve statically", () => {
    expect(
      pathErrors(
        tool({
          inputs: [
            READS,
            { name: "any", type: "data_collection" },
            { name: "rec", type: "data_collection", collection_type: "record" },
            { name: "key", type: "text" },
            // YAML tools don't parse sections; references into one are left alone.
            { name: "opts", type: "section", parameters: [{ name: "ref", type: "data" }] },
          ],
          shell_command: [
            "${ const r = inputs.reads; return r.whatever; }",
            "$(inputs.reads[inputs.key])",
            "$(inputs.reads.elements[inputs.key].path)",
            "$(inputs.any.elements.anything)",
            "$(inputs.rec.elements.field.path)",
            "$(inputs.reads.hasOwnProperty('x'))",
            "$(inputs.opts.anything.path)",
            "$(cat not javascript)",
            "\\$(inputs.reads.not_an_expression)",
          ].join(" "),
        }),
      ),
    ).toEqual([]);
  });

  it("leaves unknown roots to the undeclared-input check", () => {
    const result = validateUserToolSource(tool({ shell_command: "cat $(inputs.missing.path)" }));
    expect(result.errors.map((e) => e.message)).toEqual([
      "Value error, references inputs.missing but no input named 'missing' is declared",
    ]);
  });

  it("reports each problem once per template", () => {
    expect(
      pathErrors(
        tool({
          inputs: [{ name: "input", type: "data" }],
          shell_command: "cat $(inputs.input.file) $(inputs.input.file)",
        }),
      ),
    ).toHaveLength(1);
  });
});

describe("inputs.* references in UDT output labels", () => {
  const doc = (label: string) =>
    tool({
      inputs: [
        { name: "input", type: "data" },
        READS,
        {
          name: "opts",
          type: "conditional",
          test_parameter: { name: "on", type: "boolean" },
          whens: [{ discriminator: true, parameters: [{ name: "tag", type: "text" }] }],
        },
        { name: "extra", type: "repeat", parameters: [{ name: "file", type: "data" }] },
      ],
      outputs: [{ type: "data", name: "out", from_work_dir: "out.txt", label }],
    });

  it("accepts the references Galaxy fills in", () => {
    expect(
      pathErrors(
        doc(
          "$(inputs.input.name) $(inputs.input.element_identifier) $(inputs.input.format) $(inputs.reads.name) $(inputs.opts.tag) $(inputs.opts.on) $(runtime.on_string)",
        ),
      ),
    ).toEqual([]);
  });

  it("flags references Galaxy keeps as written", () => {
    expect(
      pathErrors(
        doc(
          "$(inputs.input.path) $(inputs.input) $(inputs.reads.format) $(inputs.opts.tag.length) $(inputs.opts.missing) $(inputs.extra) $(inputs.opts)",
        ),
      ),
    ).toEqual([
      "/outputs/0/label: Value error, label reference $(inputs.input.path) is never filled in: a data input in a label must end with one of element_identifier, format, name",
      "/outputs/0/label: Value error, label reference $(inputs.input) is never filled in: a data input in a label must end with one of element_identifier, format, name",
      "/outputs/0/label: Value error, label reference $(inputs.reads.format) is never filled in: a data_collection input in a label must end with one of element_identifier, name",
      "/outputs/0/label: Value error, label reference $(inputs.opts.tag.length) is never filled in: text input opts.tag has no fields",
      "/outputs/0/label: Value error, label reference $(inputs.opts.missing) is never filled in: there is no 'missing' in opts",
      "/outputs/0/label: Value error, label reference $(inputs.extra) is never filled in: a repeat can't be read in a label",
      "/outputs/0/label: Value error, label reference $(inputs.opts) is never filled in: conditional opts is not text; reference one of its inputs",
    ]);
  });
});
