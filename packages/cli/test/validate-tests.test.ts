import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheKey } from "@galaxy-tool-util/core";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import { parseXmlTool } from "@galaxy-tool-util/tool-xml";
import { runValidateTests } from "../src/commands/validate-tests.js";

describe("runValidateTests", () => {
  let dir: string;
  let logs: string[];
  let errs: string[];
  let origLog: typeof console.log;
  let origErr: typeof console.error;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gxwf-validate-tests-"));
    logs = [];
    errs = [];
    origLog = console.log;
    origErr = console.error;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    console.error = (...args: unknown[]) => errs.push(args.join(" "));
    process.exitCode = 0;
  });

  afterEach(async () => {
    console.log = origLog;
    console.error = origErr;
    await rm(dir, { recursive: true, force: true });
    process.exitCode = 0;
  });

  it("valid test file → OK, exit 0", async () => {
    const file = join(dir, "ok-tests.yml");
    await writeFile(
      file,
      `- doc: ok
  job:
    input:
      class: File
      path: test-data/foo.txt
  outputs: {}
`,
    );
    await runValidateTests(file);
    expect(process.exitCode).toBe(0);
    expect(logs.join("\n")).toContain("OK");
  });

  it("invalid test file → errors, exit 1", async () => {
    const file = join(dir, "bad-tests.yml");
    await writeFile(
      file,
      `- doc: bad
  job:
    input:
      type: File
      value: foo
  outputs: {}
`,
    );
    await runValidateTests(file);
    expect(process.exitCode).toBe(1);
    expect(errs.join("\n")).toContain("validation error");
  });

  it("--json emits report", async () => {
    const file = join(dir, "json-tests.yml");
    await writeFile(file, `- doc: x\n  job: {}\n  outputs: {}\n`);
    await runValidateTests(file, { json: true });
    const out = logs.join("\n");
    const report = JSON.parse(out);
    expect(report.file).toBe(file);
    expect(report.valid).toBe(true);
  });

  describe("--workflow cross-check", () => {
    async function writeBasicWorkflow(): Promise<string> {
      const wf = join(dir, "basic.gxwf.yml");
      await writeFile(
        wf,
        `class: GalaxyWorkflow
inputs:
  input_file:
    type: File
  threshold:
    type: int
    optional: true
    default: 5
outputs:
  result:
    outputSource: t/out
steps:
  t:
    tool_id: t
    in: {input: input_file}
`,
      );
      return wf;
    }

    it("passes when tests match workflow", async () => {
      const wf = await writeBasicWorkflow();
      const tests = join(dir, "ok-tests.yml");
      await writeFile(
        tests,
        `- doc: ok
  job:
    input_file: {class: File, location: https://x}
  outputs:
    result: {asserts: {has_size: {size: 1}}}
`,
      );
      await runValidateTests(tests, { workflow: wf });
      expect(process.exitCode).toBe(0);
    });

    it("flags unknown job input + unknown output", async () => {
      const wf = await writeBasicWorkflow();
      const tests = join(dir, "bad-tests.yml");
      await writeFile(
        tests,
        `- doc: bad
  job:
    input_file: {class: File, location: https://x}
    bogus_input: 42
  outputs:
    result: {asserts: {has_size: {size: 1}}}
    phantom: {asserts: {has_text: {text: nope}}}
`,
      );
      await runValidateTests(tests, { workflow: wf, json: true });
      const report = JSON.parse(logs.join("\n"));
      const keywords = report.errors.map((e: { keyword: string }) => e.keyword);
      expect(keywords).toContain("workflow_input_undefined");
      expect(keywords).toContain("workflow_output_undefined");
      expect(process.exitCode).toBe(1);
    });

    it("flags int input with string value via workflow_input_type", async () => {
      const wf = await writeBasicWorkflow();
      const tests = join(dir, "mismatch-tests.yml");
      await writeFile(
        tests,
        `- doc: mismatch
  job:
    input_file: {class: File, location: https://x}
    threshold: not_a_number
  outputs:
    result: {asserts: {has_size: {size: 1}}}
`,
      );
      await runValidateTests(tests, { workflow: wf, json: true });
      const report = JSON.parse(logs.join("\n"));
      const entry = report.errors.find(
        (e: { keyword: string }) => e.keyword === "workflow_input_type",
      );
      expect(entry).toBeDefined();
      expect(entry.params.actualType).toBe("string");
      expect(process.exitCode).toBe(1);
    });

    it.each([
      ["ftype: fasta", undefined],
      ["ftype: bam", "workflow_output_datatype"],
      ["class: Collection", "workflow_output_kind"],
    ])("checks fixed UDT output with %s", async (assertion, keyword) => {
      const wf = join(dir, "fasta.gxwf.yml");
      await writeFile(
        wf,
        `class: GalaxyWorkflow
outputs:
  result: {outputSource: make_fasta/output1}
steps:
  make_fasta:
    run:
      class: GalaxyUserTool
      id: make_fasta
      name: Make FASTA
      version: '0.1'
      container: busybox
      shell_command: echo ACGT > out.fasta
      inputs: []
      outputs:
        - {name: output1, type: data, format: fasta, from_work_dir: out.fasta}
    state: {}
`,
      );
      const tests = join(dir, "fasta-tests.yml");
      await writeFile(
        tests,
        `- job: {}
  outputs:
    result: {${assertion}}
`,
      );
      await runValidateTests(tests, { workflow: wf, json: true });
      const report = JSON.parse(logs.join("\n"));
      expect(report.errors.map((error: { keyword: string }) => error.keyword)).toEqual(
        keyword ? [keyword] : [],
      );
      expect(process.exitCode).toBe(keyword ? 1 : 0);
    });

    it.each([
      ["class: Collection, collection_type: list", undefined],
      ["class: Collection, collection_type: paired", "workflow_output_collection_type"],
      ["ftype: txt", "workflow_output_kind"],
    ])("checks collection produced by map-over with %s", async (assertion, keyword) => {
      const wf = join(dir, "map-over.gxwf.yml");
      await writeFile(
        wf,
        `class: GalaxyWorkflow
inputs:
  reads: {type: collection, collection_type: list}
outputs:
  result: {outputSource: copy/output1}
steps:
  copy:
    run:
      class: GalaxyUserTool
      id: copy_input
      name: Copy input
      version: '0.1'
      container: busybox
      shell_command: echo example > output.txt
      inputs:
        - {name: input1, type: data, format: txt}
      outputs:
        - {name: output1, type: data, format: txt, from_work_dir: output.txt}
    in: {input1: reads}
    state: {}
`,
      );
      const tests = join(dir, "map-over-tests.yml");
      await writeFile(
        tests,
        `- job:
    reads: {class: Collection, collection_type: list, elements: []}
  outputs:
    result: {${assertion}}
`,
      );
      await runValidateTests(tests, { workflow: wf, json: true });
      const report = JSON.parse(logs.join("\n"));
      expect(report.errors.map((error: { keyword: string }) => error.keyword)).toEqual(
        keyword ? [keyword] : [],
      );
      expect(process.exitCode).toBe(keyword ? 1 : 0);
    });

    it("warns when a job maps over an input and skips that test's output checks", async () => {
      const wf = join(dir, "map-over.gxwf.yml");
      await writeFile(
        wf,
        `class: GalaxyWorkflow
inputs:
  reads: {type: collection, collection_type: list}
outputs:
  result: {outputSource: copy/output1}
steps:
  copy:
    run:
      class: GalaxyUserTool
      id: copy_input
      name: Copy input
      version: '0.1'
      container: busybox
      shell_command: echo example > output.txt
      inputs:
        - {name: input1, type: data, format: txt}
      outputs:
        - {name: output1, type: data, format: txt, from_work_dir: output.txt}
    in: {input1: reads}
    state: {}
`,
      );
      const tests = join(dir, "map-over-tests.yml");
      await writeFile(
        tests,
        `- job:
    reads: {class: Collection, collection_type: "list:list", elements: []}
  outputs:
    result: {class: Collection, collection_type: "list:list"}
`,
      );
      await runValidateTests(tests, { workflow: wf, json: true });
      const report = JSON.parse(logs.join("\n"));
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.warnings).toMatchObject([
        {
          path: "/0/job/reads/collection_type",
          keyword: "workflow_input_collection_map_over",
          severity: "warning",
        },
      ]);
      expect(process.exitCode).toBe(0);
    });

    it.each([
      ["tabular", true],
      ["bam", false],
      ["custom", true],
    ])("checks input filetype %s with a datatype registry", async (filetype, valid) => {
      const wf = join(dir, "input.gxwf.yml");
      await writeFile(wf, "class: GalaxyWorkflow\ninputs:\n  source: {type: File, format: txt}\n");
      const tests = join(dir, "input-tests.yml");
      await writeFile(
        tests,
        `- job:
    source: {class: File, path: input.txt, filetype: ${filetype}}
  outputs: {}
`,
      );
      const datatypes = join(dir, "datatypes.json");
      await writeFile(
        datatypes,
        JSON.stringify({
          datatypes: ["txt", "tabular", "bam"],
          datatypes_mapping: {
            ext_to_class_name: { txt: "Text", tabular: "Tabular", bam: "Bam" },
            class_to_classes: { Text: { Text: true }, Tabular: { Text: true }, Bam: { Bam: true } },
          },
        }),
      );
      await runValidateTests(tests, { workflow: wf, datatypes, json: true });
      const report = JSON.parse(logs.join("\n"));
      expect(report.valid).toBe(valid);
      expect(report.errors.map((error: { keyword: string }) => error.keyword)).toEqual(
        valid ? [] : ["workflow_input_format"],
      );
    });

    it("uses a cached Galaxy wrapper without treating conditional output formats as fixed", async () => {
      const contents = await readFile(
        new URL(
          "../../tool-xml/test/fixtures/tool_parsing/tools/output_format.xml",
          import.meta.url,
        ),
        "utf-8",
      );
      const tool = parseXmlTool(contents, () => {
        throw new Error("The fixture has no imports");
      });
      const cacheDir = join(dir, "cache");
      const cache = makeNodeToolCache({ cacheDir });
      const coords = cache.resolveToolCoordinates("output_format", "1.0.0");
      const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, "1.0.0");
      await cache.saveTool(key, tool, "output_format", "1.0.0", "local");

      const wf = join(dir, "conditional.gxwf.yml");
      await writeFile(
        wf,
        `class: GalaxyWorkflow
outputs:
  conditional: {outputSource: step/change_format_output}
  fixed: {outputSource: step/direct_output}
steps:
  step:
    tool_id: output_format
    tool_version: '1.0.0'
    state: {input_text: foo}
`,
      );
      const tests = join(dir, "conditional-tests.yml");
      await writeFile(
        tests,
        `- job: {}
  outputs:
    conditional: {ftype: fastqsolexa}
    fixed: {ftype: bam}
`,
      );
      await runValidateTests(tests, { workflow: wf, cacheDir, json: true });
      expect(JSON.parse(logs.join("\n")).errors).toEqual([]);
      logs.length = 0;

      await cache.saveToolSource(key, { contents, language: "xml", macrosExpanded: true });
      await runValidateTests(tests, { workflow: wf, cacheDir, json: true });
      const report = JSON.parse(logs.join("\n"));
      expect(report.errors).toMatchObject([
        { path: "/0/outputs/fixed/ftype", keyword: "workflow_output_datatype" },
      ]);
    });

    it("reports a readable error when workflow file is missing", async () => {
      const tests = join(dir, "ok-tests.yml");
      await writeFile(tests, `- doc: x\n  job: {}\n  outputs: {}\n`);
      await runValidateTests(tests, { workflow: join(dir, "no-such.gxwf.yml"), json: true });
      const report = JSON.parse(logs.join("\n"));
      const entry = report.errors.find(
        (e: { keyword: string }) => e.keyword === "workflow_load_error",
      );
      expect(entry).toBeDefined();
      expect(process.exitCode).toBe(1);
    });
  });
});
