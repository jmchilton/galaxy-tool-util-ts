import { Command } from "commander";
import { runAdd } from "../commands/add.js";
import { runList } from "../commands/list.js";
import { runInfo } from "../commands/info.js";
import { runClear } from "../commands/clear.js";
import { runPopulateWorkflow } from "../commands/populate-workflow.js";
import { runSchema } from "../commands/schema.js";
import { runStructuralSchema } from "../commands/structural-schema.js";

export function buildGalaxyToolCacheProgram(): Command {
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
    .command("populate-workflow")
    .description("Scan a workflow and cache all referenced tools")
    .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
    .option("--cache-dir <dir>", "Cache directory")
    .option("--galaxy-url <url>", "Galaxy instance URL for fallback")
    .action(runPopulateWorkflow);

  program
    .command("structural-schema")
    .description("Export the structural JSON Schema for Galaxy workflows")
    .option("--format <fmt>", "Workflow format: format2 (default) or native", "format2")
    .option("--output <file>", "Output file (default: stdout)")
    .action(runStructuralSchema);

  return program;
}
