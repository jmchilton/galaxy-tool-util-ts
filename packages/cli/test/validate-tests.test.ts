import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

    describe("collection shape and datatype", () => {
      const MAPPED_WF = fileURLToPath(
        new URL(
          "../../connection-validation/test/fixtures/mapped_subworkflow_outputs.gxwf.yml",
          import.meta.url,
        ),
      );
      const READS = `{class: Collection, collection_type: list, elements: []}`;

      it("flags kind mismatches on inputs and resolved outputs", async () => {
        const tests = join(dir, "kinds-tests.yml");
        await writeFile(
          tests,
          `- doc: kinds
  job:
    genome: {class: File, path: g.fa}
    reads: ${READS}
  outputs:
    mapped: {ftype: txt}
    single: {class: Collection, collection_type: list, element_tests: {}}
    reads_out: {class: Collection, collection_type: "list:paired", element_tests: {}}
- doc: file on a collection input
  job:
    genome: {class: File, path: g.fa}
    reads: {class: File, path: r.fq}
  outputs: {}
- doc: collection maps over the data input; output shapes not checked
  job:
    genome: {class: Collection, collection_type: list, elements: []}
    reads: ${READS}
  outputs:
    single: {class: Collection, collection_type: list, element_tests: {}}
`,
        );
        await runValidateTests(tests, { workflow: MAPPED_WF, json: true });
        const report = JSON.parse(logs.join("\n"));
        const at = (ds: { path: string; keyword: string }[]) => ds.map((e) => [e.path, e.keyword]);
        expect(at(report.errors)).toEqual([
          ["/0/outputs/mapped", "workflow_output_kind"],
          ["/0/outputs/single", "workflow_output_kind"],
          ["/0/outputs/reads_out/collection_type", "workflow_output_collection_type"],
          ["/1/job/reads", "workflow_input_kind"],
        ]);
        expect(at(report.warnings)).toEqual([
          ["/2/job/genome", "workflow_input_collection_map_over"],
        ]);
        expect(process.exitCode).toBe(1);
      });

      it("reports filetype outside format as a warning; stays valid", async () => {
        const tests = join(dir, "format-tests.yml");
        await writeFile(
          tests,
          `- doc: format
  job:
    genome: {class: File, path: g.bam, filetype: bam}
    reads: ${READS}
  outputs:
    mapped: {class: Collection, collection_type: list, element_tests: {}}
`,
        );
        await runValidateTests(tests, { workflow: MAPPED_WF, json: true });
        const report = JSON.parse(logs.join("\n"));
        expect(report.valid).toBe(true);
        expect(report.errors).toEqual([]);
        expect(report.warnings.map((e: { keyword: string }) => e.keyword)).toEqual([
          "workflow_input_format",
        ]);
        expect(process.exitCode).toBe(0);
      });

      it("leaves unresolved outputs named like Object members unchecked", async () => {
        const wf = join(dir, "proto.gxwf.yml");
        await writeFile(
          wf,
          `class: GalaxyWorkflow
inputs:
  genome: {type: data}
outputs:
  constructor: {outputSource: uncached/out_file1}
  toString: {outputSource: uncached/out_file1}
steps:
  uncached:
    tool_id: not_a_cached_tool
    tool_version: "1.0"
    in: {input1: genome}
`,
        );
        const tests = join(dir, "proto-tests.yml");
        await writeFile(
          tests,
          `- doc: dataset assertions on unresolved outputs
  job:
    genome: {class: File, path: g.fa}
  outputs:
    constructor: {ftype: txt}
    toString: {ftype: txt}
`,
        );
        await runValidateTests(tests, { workflow: wf, json: true, cacheDir: dir });
        const report = JSON.parse(logs.join("\n"));
        expect(report.errors).toEqual([]);
        expect(report.valid).toBe(true);
      });
    });
  });
});
