#!/usr/bin/env node

import { Command } from "commander";
import { runValidateWorkflow } from "../commands/validate-workflow.js";

const program = new Command();

program
  .name("galaxy-workflow-validate")
  .description("Validate Galaxy workflow files (structure + optional tool state)")
  .version("1.0.0")
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

program.parse();
