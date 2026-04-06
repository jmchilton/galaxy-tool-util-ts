#!/usr/bin/env node

import { Command } from "commander";
import { runClean } from "../commands/clean.js";
import { runCleanTree } from "../commands/clean-tree.js";
import { runConvert } from "../commands/convert.js";
import { runConvertTree } from "../commands/convert-tree.js";
import { runRoundtrip } from "../commands/roundtrip.js";
import { runRoundtripTree } from "../commands/roundtrip-tree.js";
import { runLint } from "../commands/lint.js";
import { runLintTree } from "../commands/lint-tree.js";
import { runValidateWorkflow } from "../commands/validate-workflow.js";
import { runValidateTree } from "../commands/validate-tree.js";
import { addStrictOptions } from "../commands/strict-options.js";

const program = new Command();

program
  .name("gxwf")
  .description("Galaxy workflow operations — validate, clean, lint, convert (single-file and tree)")
  .version("1.0.0");

addStrictOptions(
  program
    .command("validate")
    .description("Validate Galaxy workflow files (structure + optional tool state)")
    .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
    .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
    .option("--no-tool-state", "Skip tool state validation")
    .option("--cache-dir <dir>", "Tool cache directory")
    .option("--mode <mode>", "Validation backend: effect (default) or json-schema", "effect")
    .option(
      "--tool-schema-dir <dir>",
      "Directory of pre-exported per-tool JSON Schemas (for offline json-schema mode)",
    ),
).action(runValidateWorkflow);

program
  .command("clean")
  .description("Strip stale keys and decode legacy tool_state encoding")
  .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
  .option("--output <file>", "Write cleaned workflow to file (default: stdout)")
  .option("--diff", "Show diff of changes instead of writing output")
  .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
  .action(runClean);

addStrictOptions(
  program
    .command("lint")
    .description("Lint Galaxy workflow — structural checks, best practices, tool state validation")
    .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
    .option("--skip-best-practices", "Skip annotation/creator/license/label checks")
    .option("--skip-state-validation", "Skip tool state validation against cached tool definitions")
    .option("--cache-dir <dir>", "Tool cache directory (for state validation)")
    .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
    .option("--json", "Output structured JSON result"),
).action(runLint);

addStrictOptions(
  program
    .command("convert")
    .description("Convert between native (.ga) and format2 (.gxwf.yml) formats")
    .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
    .option("--to <format>", "Target format: native or format2 (infers opposite by default)")
    .option("--output <file>", "Write result to file (default: stdout)")
    .option("--compact", "Omit position info in format2 output")
    .option("--json", "Force JSON output")
    .option("--yaml", "Force YAML output")
    .option("--format <fmt>", "Force source format (auto-detected by default)")
    .option("--stateful", "Use cached tool definitions for schema-aware state re-encoding")
    .option("--cache-dir <dir>", "Tool cache directory (for --stateful)"),
).action(runConvert);

addStrictOptions(
  program
    .command("roundtrip")
    .description("Roundtrip-validate a native workflow: native → format2 → native, diff tool_state")
    .argument("<file>", "Native workflow file (.ga)")
    .option("--cache-dir <dir>", "Tool cache directory")
    .option("--format <fmt>", "Force source format (must resolve to native)")
    .option("--json", "Output structured JSON report")
    .option("--errors-only", "Suppress benign diffs and clean steps from output")
    .option("--benign-only", "Show only steps with benign diffs (no errors, no failures)")
    .option("--brief", "Omit per-diff list; show only the one-line summary"),
).action(runRoundtrip);

// -- Tree (batch) variants --

addStrictOptions(
  program
    .command("validate-tree")
    .description("Batch validate all workflows under a directory")
    .argument("<dir>", "Directory to scan for workflows")
    .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
    .option("--no-tool-state", "Skip tool state validation")
    .option("--cache-dir <dir>", "Tool cache directory")
    .option("--mode <mode>", "Validation backend: effect (default) or json-schema", "effect")
    .option(
      "--tool-schema-dir <dir>",
      "Directory of pre-exported per-tool JSON Schemas (for offline json-schema mode)",
    )
    .option("--json", "Output structured JSON report"),
).action(runValidateTree);

addStrictOptions(
  program
    .command("lint-tree")
    .description("Batch lint all workflows under a directory")
    .argument("<dir>", "Directory to scan for workflows")
    .option("--skip-best-practices", "Skip annotation/creator/license/label checks")
    .option("--skip-state-validation", "Skip tool state validation against cached tool definitions")
    .option("--cache-dir <dir>", "Tool cache directory (for state validation)")
    .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
    .option("--json", "Output structured JSON report"),
).action(runLintTree);

program
  .command("clean-tree")
  .description("Batch clean all workflows under a directory")
  .argument("<dir>", "Directory to scan for workflows")
  .option("--output-dir <dir>", "Write cleaned workflows to directory (mirrors source tree)")
  .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
  .option("--json", "Output structured JSON report")
  .action(runCleanTree);

addStrictOptions(
  program
    .command("convert-tree")
    .description("Batch convert all workflows under a directory")
    .argument("<dir>", "Directory to scan for workflows")
    .option("--to <format>", "Target format: native or format2 (infers opposite by default)")
    .option("--output-dir <dir>", "Write converted workflows to directory (required)")
    .option("--compact", "Omit position info in format2 output")
    .option("--report-json", "Output structured JSON report")
    .option("--json", "Force JSON output for converted files")
    .option("--yaml", "Force YAML output")
    .option("--format <fmt>", "Force source format (auto-detected by default)")
    .option("--stateful", "Use cached tool definitions for schema-aware state re-encoding")
    .option("--cache-dir <dir>", "Tool cache directory (for --stateful)"),
).action(runConvertTree);

addStrictOptions(
  program
    .command("roundtrip-tree")
    .description("Batch roundtrip-validate native workflows under a directory")
    .argument("<dir>", "Directory to scan for native workflows")
    .option("--cache-dir <dir>", "Tool cache directory")
    .option("--format <fmt>", "Force source format (must resolve to native)")
    .option("--json", "Output structured JSON report")
    .option("--errors-only", "List only files with errors or failures")
    .option("--benign-only", "List only files with benign diffs (no errors, no failures)")
    .option("--brief", "Omit per-file lines; print only the aggregate summary"),
).action(runRoundtripTree);

program.parse();
