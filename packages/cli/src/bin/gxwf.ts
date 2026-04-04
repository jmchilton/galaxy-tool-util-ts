#!/usr/bin/env node

import { Command } from "commander";
import { runClean } from "../commands/clean.js";
import { runCleanTree } from "../commands/clean-tree.js";
import { runConvert } from "../commands/convert.js";
import { runConvertTree } from "../commands/convert-tree.js";
import { runLint } from "../commands/lint.js";
import { runLintTree } from "../commands/lint-tree.js";
import { runValidateWorkflow } from "../commands/validate-workflow.js";
import { runValidateTree } from "../commands/validate-tree.js";

const program = new Command();

program
  .name("gxwf")
  .description("Galaxy workflow operations — validate, clean, lint, convert (single-file and tree)")
  .version("1.0.0");

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
  )
  .action(runValidateWorkflow);

program
  .command("clean")
  .description("Strip stale keys and decode legacy tool_state encoding")
  .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
  .option("--output <file>", "Write cleaned workflow to file (default: stdout)")
  .option("--diff", "Show diff of changes instead of writing output")
  .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
  .action(runClean);

program
  .command("lint")
  .description("Lint Galaxy workflow — structural checks, best practices, tool state validation")
  .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
  .option("--skip-best-practices", "Skip annotation/creator/license/label checks")
  .option("--skip-state-validation", "Skip tool state validation against cached tool definitions")
  .option("--cache-dir <dir>", "Tool cache directory (for state validation)")
  .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
  .option("--json", "Output structured JSON result")
  .action(runLint);

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
  .action(runConvert);

// -- Tree (batch) variants --

program
  .command("validate-tree")
  .description("Batch validate all workflows under a directory")
  .argument("<dir>", "Directory to scan for workflows")
  .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
  .option("--no-tool-state", "Skip tool state validation")
  .option("--cache-dir <dir>", "Tool cache directory")
  .option("--mode <mode>", "Validation backend: effect (default) or json-schema", "effect")
  .option("--json", "Output structured JSON report")
  .action(runValidateTree);

program
  .command("lint-tree")
  .description("Batch lint all workflows under a directory")
  .argument("<dir>", "Directory to scan for workflows")
  .option("--skip-best-practices", "Skip annotation/creator/license/label checks")
  .option("--skip-state-validation", "Skip tool state validation against cached tool definitions")
  .option("--cache-dir <dir>", "Tool cache directory (for state validation)")
  .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
  .option("--json", "Output structured JSON report")
  .action(runLintTree);

program
  .command("clean-tree")
  .description("Batch clean all workflows under a directory")
  .argument("<dir>", "Directory to scan for workflows")
  .option("--output-dir <dir>", "Write cleaned workflows to directory (mirrors source tree)")
  .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
  .option("--json", "Output structured JSON report")
  .action(runCleanTree);

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
  .action(runConvertTree);

program.parse();
