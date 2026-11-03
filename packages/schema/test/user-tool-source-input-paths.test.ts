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
        "/shell_command: inputs.input.filepath: data input 'input' has no field 'filepath' at job runtime",
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

  const SKIP_INPUTS = [
    READS,
    { name: "any", type: "data_collection" },
    { name: "rec", type: "data_collection", collection_type: "record" },
    { name: "key", type: "text" },
    // The TS YAML parser doesn't read sections; references into one are left alone.
    { name: "opts", type: "section", parameters: [{ name: "ref", type: "data" }] },
  ];

  it.each([
    ["an alias", "${ const r = inputs.reads; return r.whatever; }"],
    ["a computed key", "$(inputs.reads[inputs.key])"],
    ["a computed element key", "$(inputs.reads.elements[inputs.key].path)"],
    ["an untyped collection's elements", "$(inputs.any.elements.anything)"],
    ["a record's elements", "$(inputs.rec.elements.field.path)"],
    ["an Object.prototype member", "$(inputs.reads.hasOwnProperty('x'))"],
    ["an unparsed section", "$(inputs.opts.anything.path)"],
    ["a body that isn't JavaScript", "$(cat not javascript)"],
    ["an escaped $(", "\\$(inputs.reads.not_an_expression)"],
    ["an escaped ${", "\\${inputs.reads.not_an_expression}"],
  ])("skips %s", (_what, shell_command) => {
    expect(pathErrors(tool({ inputs: SKIP_INPUTS, shell_command }))).toEqual([]);
  });

  // Each template holds one bad path; the scanner must find it as cwl_utils' scanner does.
  it.each([
    ["after a double backslash", "\\\\$(inputs.input.bad)"],
    ["with ) inside quotes", "$(inputs.input.bad + ')')"],
    ["in a ${} body with an object literal", "${ var o = {a: {b: 1}}; return inputs.input.bad; }"],
    ["before a trailing // comment", "$(inputs.input.bad // trailing comment\n)"],
    ["in a template literal with quotes", "$(`'${inputs.input.bad}'`)"],
  ])("finds the expression %s", (_what, shell_command) => {
    expect(pathErrors(tool({ inputs: [{ name: "input", type: "data" }], shell_command }))).toEqual([
      expect.stringContaining("inputs.input.bad: data input 'input' has no field 'bad'"),
    ]);
  });

  it("accepts a path any same-named conditional branch parameter has", () => {
    const doc = (cmd: string) =>
      tool({
        inputs: [
          {
            name: "lib",
            type: "conditional",
            test_parameter: {
              name: "layout",
              type: "select",
              options: [
                { value: "single", label: "Single" },
                { value: "paired", label: "Paired" },
              ],
            },
            whens: [
              { discriminator: "single", parameters: [{ name: "reads", type: "data" }] },
              {
                discriminator: "paired",
                parameters: [{ name: "reads", type: "data_collection", collection_type: "paired" }],
              },
            ],
          },
        ],
        shell_command: cmd,
      });
    expect(
      pathErrors(
        doc(
          "$(inputs.lib.layout == 'paired' ? inputs.lib.reads.elements.forward.path : inputs.lib.reads.path)",
        ),
      ),
    ).toEqual([]);
    expect(pathErrors(doc("$(inputs.lib.reads.filename)"))).toEqual([
      expect.stringContaining("inputs.lib.reads.filename: data input 'lib.reads' has no field"),
    ]);
  });

  it("accepts dataset elements of a list where list:paired_or_unpaired is declared", () => {
    const doc = (cmd: string) =>
      tool({
        inputs: [
          { name: "r", type: "data_collection", collection_type: "list:paired_or_unpaired" },
        ],
        shell_command: cmd,
      });
    expect(
      pathErrors(
        doc("$(inputs.r.elements[0].path) $(inputs.r.elements[0].elements.unpaired.path)"),
      ),
    ).toEqual([]);
    expect(pathErrors(doc("$(inputs.r.elements[0].filename)"))).toHaveLength(1);
  });

  it("accepts indexing a string", () => {
    expect(
      pathErrors(
        tool({
          inputs: [
            { name: "t", type: "text" },
            { name: "d", type: "data" },
          ],
          shell_command: "$(inputs.t[0]) $(inputs.d.path[0])",
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
        { name: "files", type: "data", multiple: true },
        {
          name: "sel",
          type: "select",
          multiple: true,
          options: [{ value: "a", label: "A" }],
        },
      ],
      outputs: [{ type: "data", name: "out", from_work_dir: "out.txt", label }],
    });

  it("accepts a reference any same-named conditional branch parameter fills in", () => {
    const label = (ref: string) =>
      tool({
        inputs: [
          {
            name: "lib",
            type: "conditional",
            test_parameter: { name: "paired", type: "boolean" },
            whens: [
              { discriminator: false, parameters: [{ name: "reads", type: "data" }] },
              { discriminator: true, parameters: [{ name: "reads", type: "data_collection" }] },
            ],
          },
        ],
        outputs: [{ type: "data", name: "out", from_work_dir: "out.txt", label: ref }],
      });
    expect(pathErrors(label("$(inputs.lib.reads.format)"))).toEqual([]);
    expect(pathErrors(label("$(inputs.lib.reads.path)"))).toHaveLength(1);
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

  it.each([
    ["$(inputs.input.path)", "a data input in a label must end with one of"],
    ["$(inputs.input)", "a data input in a label must end with one of"],
    ["$(inputs.reads.format)", "a data_collection input in a label must end with one of"],
    ["$(inputs.opts.tag.length)", "text input opts.tag has no fields"],
    ["$(inputs.opts.missing)", "there is no 'missing' in opts"],
    ["$(inputs.extra)", "a repeat can't be read in a label"],
    ["$(inputs.opts)", "conditional opts is not text"],
    ["$(inputs.files.name)", "multiple data input files can't be read in a label"],
    ["$(inputs.sel)", "multiple select input sel can't be read in a label"],
  ])("flags %s, which Galaxy keeps as written", (ref, reason) => {
    expect(pathErrors(doc(ref))).toEqual([
      expect.stringMatching(
        new RegExp(
          `^/outputs/0/label: label reference ${escape(ref)} is never filled in: ${escape(reason)}`,
        ),
      ),
    ]);
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
