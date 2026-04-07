/**
 * Snapshot + golden tests for the Nunjucks report renderer.
 *
 * Each test builds a minimal fixture via the builder helpers in report-models,
 * renders it, and checks structural markers. On first run (or UPDATE_GOLDENS=1)
 * the output is written to fixtures/report-goldens/*.md.golden for exact
 * comparison on subsequent runs.
 */
import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import {
  buildTreeValidationReport,
  buildWorkflowValidationResult,
  buildLintTreeReport,
  buildLintWorkflowResult,
  buildTreeCleanReport,
  buildWorkflowCleanResult,
  buildRoundTripTreeReport,
  buildExportTreeReport,
  buildWorkflowExportResult,
  buildToNativeTreeReport,
  buildWorkflowToNativeResult,
  type CleanStepResult,
  type ValidationStepResult,
  type RoundTripValidationResult,
} from "@galaxy-tool-util/schema";
import { renderReport } from "../src/workflow/report-templates.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDENS_DIR = join(__dirname, "fixtures/report-goldens");
const UPDATE_GOLDENS = process.env["UPDATE_GOLDENS"] === "1";

async function checkOrUpdateGolden(name: string, actual: string): Promise<void> {
  const goldenPath = join(GOLDENS_DIR, name);
  if (UPDATE_GOLDENS || !existsSync(goldenPath)) {
    await writeFile(goldenPath, actual, "utf-8");
    return;
  }
  const expected = await readFile(goldenPath, "utf-8");
  expect(actual).toBe(expected);
}

// ── Fixtures ──────────────────────────────────────────────────────────

function makeValidateReport() {
  const okStep: ValidationStepResult = {
    step: "0",
    tool_id: "toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc/0.73",
    version: "0.73",
    status: "ok",
    errors: [],
  };
  const failStep: ValidationStepResult = {
    step: "1",
    tool_id: "toolshed.g2.bx.psu.edu/repos/devteam/bwa/bwa/0.7.17",
    version: "0.7.17",
    status: "fail",
    errors: ["Missing required parameter: reference"],
  };
  const wf1 = buildWorkflowValidationResult("subdir/workflow_ok.ga", [okStep]);
  const wf2 = buildWorkflowValidationResult("subdir/workflow_fail.ga", [okStep, failStep]);
  const wf3 = buildWorkflowValidationResult("standalone.ga", [], { error: "Parse error" });
  return buildTreeValidationReport("/data/workflows", [wf1, wf2, wf3]);
}

function makeLintReport() {
  const okStep: ValidationStepResult = {
    step: "0",
    tool_id: "cat1",
    version: "1.0",
    status: "ok",
    errors: [],
  };
  const wf1 = buildLintWorkflowResult("good.gxwf.yml", 0, 0, [okStep]);
  const wf2 = buildLintWorkflowResult("bad.gxwf.yml", 2, 1, [okStep]);
  const wf3 = buildLintWorkflowResult("skipped.gxwf.yml", 0, 0, [], {
    skipped_reason: "legacy_encoding",
  });
  return buildLintTreeReport("/data/workflows", [wf1, wf2, wf3]);
}

function makeCleanReport() {
  const cleanStep: CleanStepResult = {
    step: "0",
    tool_id: "cat1",
    version: "1.0",
    removed_keys: ["runtime_inputs"],
    skipped: false,
    skip_reason: "",
    display_label: "cat1 1.0",
  };
  const wf1 = buildWorkflowCleanResult("workflow_clean.ga", [cleanStep]);
  const wf2 = buildWorkflowCleanResult("workflow_nothing.ga", []);
  return buildTreeCleanReport("/data/workflows", [wf1, wf2]);
}

function makeRoundtripReport() {
  const okResult: RoundTripValidationResult = {
    workflow_path: "ok_workflow.ga",
    category: "(root)",
    conversion_result: null,
    diffs: [],
    step_id_mapping: null,
    stale_clean_results: null,
    error: null,
    skipped_reason: null,
    structure_errors: [],
    encoding_errors: [],
    error_diffs: [],
    benign_diffs: [],
    ok: true,
    status: "ok",
    conversion_failure_lines: [],
    summary_line: "OK",
  };
  const failResult: RoundTripValidationResult = {
    ...okResult,
    workflow_path: "fail_workflow.ga",
    ok: false,
    status: "roundtrip_mismatch",
    summary_line: "FAIL",
  };
  return buildRoundTripTreeReport("/data/workflows", [okResult, failResult]);
}

function makeExportReport() {
  const ok = buildWorkflowExportResult("ok.ga", { ok: true, steps_converted: 5 });
  const partial = buildWorkflowExportResult("partial.ga", {
    ok: false,
    steps_converted: 3,
    steps_fallback: 2,
  });
  const err = buildWorkflowExportResult("err.ga", { error: "Unsupported step type" });
  return buildExportTreeReport("/data/workflows", "/data/out", [ok, partial, err]);
}

function makeToNativeReport() {
  const ok = buildWorkflowToNativeResult("ok.gxwf.yml", { ok: true, steps_encoded: 4 });
  const partial = buildWorkflowToNativeResult("partial.gxwf.yml", {
    ok: false,
    steps_encoded: 2,
    steps_fallback: 1,
  });
  return buildToNativeTreeReport("/data/workflows", "/data/out", [ok, partial]);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("renderReport", () => {
  describe("validate_tree.md.j2", () => {
    it("renders markdown with H1 heading and summary", async () => {
      const report = makeValidateReport();
      const md = await renderReport("validate_tree.md.j2", report);
      expect(md).toContain("# Workflow Validation Report");
      expect(md).toContain("workflow_fail.ga");
      expect(md).toContain("Parse error");
    });

    it("golden file matches", async () => {
      const md = await renderReport("validate_tree.md.j2", makeValidateReport());
      await checkOrUpdateGolden("validate_tree.md.golden", md);
    });
  });

  describe("lint_tree.md.j2", () => {
    it("renders markdown with H1 heading", async () => {
      const report = makeLintReport();
      const md = await renderReport("lint_tree.md.j2", report);
      expect(md).toContain("# Lint Report");
      expect(md).toContain("bad.gxwf.yml");
    });

    it("golden file matches", async () => {
      const md = await renderReport("lint_tree.md.j2", makeLintReport());
      await checkOrUpdateGolden("lint_tree.md.golden", md);
    });
  });

  describe("clean_tree.md.j2", () => {
    it("renders markdown with H1 heading", async () => {
      const report = makeCleanReport();
      const md = await renderReport("clean_tree.md.j2", report);
      expect(md).toContain("# Stale State Cleaning Report");
      expect(md).toContain("workflow_clean.ga");
    });

    it("golden file matches", async () => {
      const md = await renderReport("clean_tree.md.j2", makeCleanReport());
      await checkOrUpdateGolden("clean_tree.md.golden", md);
    });
  });

  describe("roundtrip_tree.md.j2", () => {
    it("renders markdown with H1 heading and summary", async () => {
      const report = makeRoundtripReport();
      const md = await renderReport("roundtrip_tree.md.j2", report);
      expect(md).toContain("# Roundtrip Validation:");
      expect(md).toContain("ok_workflow.ga");
    });

    it("golden file matches", async () => {
      const md = await renderReport("roundtrip_tree.md.j2", makeRoundtripReport());
      await checkOrUpdateGolden("roundtrip_tree.md.golden", md);
    });
  });

  describe("export_tree.md.j2", () => {
    it("renders markdown with H1 heading", async () => {
      const report = makeExportReport();
      const md = await renderReport("export_tree.md.j2", report);
      expect(md).toContain("# Export Report");
      expect(md).toContain("/data/workflows");
    });

    it("golden file matches", async () => {
      const md = await renderReport("export_tree.md.j2", makeExportReport());
      await checkOrUpdateGolden("export_tree.md.golden", md);
    });
  });

  describe("to_native_tree.md.j2", () => {
    it("renders markdown with H1 heading", async () => {
      const report = makeToNativeReport();
      const md = await renderReport("to_native_tree.md.j2", report);
      expect(md).toContain("# Conversion Report");
      expect(md).toContain("/data/workflows");
    });

    it("golden file matches", async () => {
      const md = await renderReport("to_native_tree.md.j2", makeToNativeReport());
      await checkOrUpdateGolden("to_native_tree.md.golden", md);
    });
  });
});
