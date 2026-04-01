#!/usr/bin/env node

import { Command } from "commander";
import { runAdd } from "../commands/add.js";
import { runList } from "../commands/list.js";
import { runInfo } from "../commands/info.js";
import { runClear } from "../commands/clear.js";
import { runSchema } from "../commands/schema.js";
import { runValidateWorkflow } from "../commands/validate-workflow.js";

const program = new Command();

program
  .name("galaxy-tool-cache")
  .description("Cache and inspect Galaxy tool metadata")
  .version("1.0.0");

program
  .command("add")
  .description("Fetch a tool from ToolShed/Galaxy and cache it")
  .argument("<tool_id>", "Tool ID (full toolshed path or TRS ID)")
  .option("--version <ver>", "Tool version")
  .option("--cache-dir <dir>", "Cache directory")
  .option("--galaxy-url <url>", "Galaxy instance URL for fallback")
  .action(runAdd);

program
  .command("list")
  .description("List cached tools")
  .option("--json", "Output as JSON")
  .option("--cache-dir <dir>", "Cache directory")
  .action(runList);

program
  .command("info")
  .description("Show metadata for a cached tool")
  .argument("<tool_id>", "Tool ID")
  .option("--version <ver>", "Tool version")
  .option("--cache-dir <dir>", "Cache directory")
  .action(runInfo);

program
  .command("clear")
  .description("Clear cached tools")
  .argument("[prefix]", "Only clear tools matching this prefix")
  .option("--cache-dir <dir>", "Cache directory")
  .action(runClear);

program
  .command("schema")
  .description("Export JSON Schema for a cached tool's parameters")
  .argument("<tool_id>", "Tool ID")
  .option("--version <ver>", "Tool version")
  .option("--representation <rep>", "State representation (e.g., workflow_step)", "workflow_step")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--cache-dir <dir>", "Cache directory")
  .action(runSchema);

program
  .command("validate-workflow")
  .description("Validate a Galaxy workflow file (structure + optional tool state)")
  .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
  .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
  .option("--no-tool-state", "Skip tool state validation")
  .option("--cache-dir <dir>", "Tool cache directory")
  .option("--mode <mode>", "Validation backend: effect (default) or json-schema", "effect")
  .option("--tool-schema-dir <dir>", "Directory of pre-exported per-tool JSON Schemas (for offline json-schema mode)")
  .action(runValidateWorkflow);

program.parse();
