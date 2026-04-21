import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, copyFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runValidateTestsTree } from "../src/commands/validate-tests-tree.js";

const FIXTURES_ROOT = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "schema",
  "test",
  "fixtures",
  "test-format",
);

async function copyFixtures(srcDir: string, destDir: string, renameTo: (base: string) => string) {
  await mkdir(destDir, { recursive: true });
  for (const name of await readdir(srcDir)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    const base = name.replace(/\.(yml|yaml)$/, "");
    await copyFile(join(srcDir, name), join(destDir, renameTo(base)));
  }
}

describe("runValidateTestsTree", () => {
  let dir: string;
  let logs: string[];
  let errs: string[];
  let origLog: typeof console.log;
  let origErr: typeof console.error;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gxwf-validate-tests-tree-"));
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

  it("all positives → exit 0", async () => {
    await copyFixtures(join(FIXTURES_ROOT, "positive"), dir, (base) => `${base}-tests.yml`);
    await runValidateTestsTree(dir);
    expect(process.exitCode).toBe(0);
    expect(logs.join("\n")).toMatch(/Summary: \d+ files \| \d+ OK, 0 FAIL, 0 ERROR/);
  });

  it("mixed positives + negatives → exit 1, counts FAILs", async () => {
    await copyFixtures(join(FIXTURES_ROOT, "positive"), dir, (base) => `${base}-tests.yml`);
    await copyFixtures(
      join(FIXTURES_ROOT, "negative"),
      join(dir, "bad"),
      (base) => `${base}.gxwf-tests.yml`,
    );
    await runValidateTestsTree(dir);
    expect(process.exitCode).toBe(1);
    const out = (logs.join("\n") + "\n" + errs.join("\n")).match(
      /Summary: (\d+) files \| (\d+) OK, (\d+) FAIL, (\d+) ERROR/,
    );
    expect(out).not.toBeNull();
    const [, total, ok, fail] = out!;
    expect(Number(total)).toBeGreaterThan(0);
    expect(Number(ok)).toBeGreaterThan(0);
    expect(Number(fail)).toBeGreaterThan(0);
  });

  it("--json emits structured report with summary", async () => {
    await copyFixtures(join(FIXTURES_ROOT, "positive"), dir, (base) => `${base}-tests.yml`);
    await runValidateTestsTree(dir, { json: true });
    const report = JSON.parse(logs.join("\n"));
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.fail).toBe(0);
    expect(report.files).toBeInstanceOf(Array);
  });

  it("ignores non-test YAML files", async () => {
    await writeFile(join(dir, "not-a-test.yml"), "foo: bar\n");
    await writeFile(join(dir, "something-tests.yml"), "- doc: ok\n  job: {}\n  outputs: {}\n");
    await runValidateTestsTree(dir);
    expect(process.exitCode).toBe(0);
    expect(logs.join("\n")).toContain("Summary: 1 files");
  });

  it("reports YAML parse errors as ERROR", async () => {
    await writeFile(join(dir, "broken-tests.yml"), "::: not yaml :::\n  - [\n");
    await runValidateTestsTree(dir);
    expect(process.exitCode).toBe(1);
    expect(errs.join("\n")).toMatch(/ERROR/);
  });

  describe("--auto-workflow sibling discovery", () => {
    async function writeBasicWorkflow(path: string): Promise<void> {
      await writeFile(
        path,
        `class: GalaxyWorkflow
inputs:
  input_file:
    type: File
outputs:
  result:
    outputSource: t/out
steps:
  t:
    tool_id: t
    in: {input: input_file}
`,
      );
    }

    it("pairs foo.gxwf-tests.yml with foo.gxwf.yml and cross-checks", async () => {
      await writeBasicWorkflow(join(dir, "foo.gxwf.yml"));
      await writeFile(
        join(dir, "foo.gxwf-tests.yml"),
        `- doc: bad
  job:
    input_file: {class: File, location: https://x}
    bogus: 1
  outputs: {}
`,
      );
      await runValidateTestsTree(dir, { autoWorkflow: true, json: true });
      const report = JSON.parse(logs.join("\n"));
      expect(report.files).toHaveLength(1);
      expect(report.files[0].workflow).toBe("foo.gxwf.yml");
      const keywords = report.files[0].errors.map((e: { keyword: string }) => e.keyword);
      expect(keywords).toContain("workflow_input_undefined");
      expect(process.exitCode).toBe(1);
    });

    it("pairs bar-tests.yml with bar.ga", async () => {
      await writeFile(
        join(dir, "bar.ga"),
        JSON.stringify({
          a_galaxy_workflow: "true",
          "format-version": "0.1",
          steps: {
            "0": {
              id: 0,
              type: "data_input",
              label: "in1",
              inputs: [{ name: "in1" }],
              tool_state: '{"name":"in1","optional":false}',
              input_connections: {},
            },
          },
        }),
      );
      await writeFile(
        join(dir, "bar-tests.yml"),
        `- doc: ok
  job:
    in1: {class: File, location: https://x}
  outputs: {}
`,
      );
      await runValidateTestsTree(dir, { autoWorkflow: true, json: true });
      const report = JSON.parse(logs.join("\n"));
      expect(report.files[0].workflow).toBe("bar.ga");
      expect(report.files[0].valid).toBe(true);
      expect(process.exitCode).toBe(0);
    });

    it("silent no-op when no sibling workflow found", async () => {
      await writeFile(
        join(dir, "orphan-tests.yml"),
        `- doc: ok
  job: {}
  outputs: {}
`,
      );
      await runValidateTestsTree(dir, { autoWorkflow: true, json: true });
      const report = JSON.parse(logs.join("\n"));
      expect(report.files[0].workflow).toBeUndefined();
      expect(report.files[0].valid).toBe(true);
      expect(process.exitCode).toBe(0);
    });
  });
});
