import { Command } from "commander";
import { runClean } from "../commands/clean.js";
import { runCleanTree } from "../commands/clean-tree.js";
import { runConvert } from "../commands/convert.js";
import { runConvertTree } from "../commands/convert-tree.js";
import { runRoundtrip } from "../commands/roundtrip.js";
import { runRoundtripTree } from "../commands/roundtrip-tree.js";
import { runLint } from "../commands/lint.js";
import { runMermaid } from "../commands/mermaid.js";
import { runLintTree } from "../commands/lint-tree.js";
import { runValidateWorkflow } from "../commands/validate-workflow.js";
import { runValidateTests } from "../commands/validate-tests.js";
import { runValidateTestsTree } from "../commands/validate-tests-tree.js";
import { runValidateTree } from "../commands/validate-tree.js";
import { runToolSearch } from "../commands/tool-search.js";
import { runToolVersions } from "../commands/tool-versions.js";
import { runToolRevisions } from "../commands/tool-revisions.js";
import { runRepoSearch } from "../commands/repo-search.js";
import { addStrictOptions } from "../commands/strict-options.js";

export function buildGxwfProgram(): Command {
  const program = new Command();

  program
    .name("gxwf")
    .description(
      "Galaxy workflow operations — validate, clean, lint, convert (single-file and tree)",
    )
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
      )
      .option("--json", "Output structured JSON report")
      .option("--report-html [file]", "Write HTML report to file (or stdout if omitted)")
      .option(
        "--connections",
        "Validate connection-type compatibility (collection algebra, map-over)",
      ),
  ).action(runValidateWorkflow);

  program
    .command("validate-tests")
    .description(
      "Validate a workflow-test file (*-tests.yml, *.gxwf-tests.yml) against the Galaxy Tests schema",
    )
    .argument("<file>", "Tests file (*-tests.yml)")
    .option("--json", "Output structured JSON report")
    .option(
      "--workflow <path>",
      "Cross-check job inputs + output assertions against a workflow (.ga / .gxwf.yml)",
    )
    .action(runValidateTests);

  program
    .command("clean")
    .description("Strip stale keys and decode legacy tool_state encoding")
    .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
    .option("--output <file>", "Write cleaned workflow to file (default: stdout)")
    .option("--diff", "Show diff of changes instead of writing output")
    .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
    .option("--json", "Output structured JSON report")
    .option("--report-html [file]", "Write HTML report to file (or stdout if omitted)")
    .option("--skip-uuid", "Skip stripping uuid fields (errors are always stripped)")
    .action(runClean);

  addStrictOptions(
    program
      .command("lint")
      .description(
        "Lint Galaxy workflow — structural checks, best practices, tool state validation",
      )
      .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
      .option("--skip-best-practices", "Skip annotation/creator/license/label checks")
      .option(
        "--skip-state-validation",
        "Skip tool state validation against cached tool definitions",
      )
      .option("--cache-dir <dir>", "Tool cache directory (for state validation)")
      .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
      .option("--json", "Output structured JSON result")
      .option("--report-html [file]", "Write HTML report to file (or stdout if omitted)"),
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
      .description(
        "Roundtrip-validate a native workflow: native → format2 → native, diff tool_state",
      )
      .argument("<file>", "Native workflow file (.ga)")
      .option("--cache-dir <dir>", "Tool cache directory")
      .option("--format <fmt>", "Force source format (must resolve to native)")
      .option("--json", "Output structured JSON report")
      .option("--errors-only", "Suppress benign diffs and clean steps from output")
      .option("--benign-only", "Show only steps with benign diffs (no errors, no failures)")
      .option("--brief", "Omit per-diff list; show only the one-line summary"),
  ).action(runRoundtrip);

  program
    .command("mermaid")
    .description("Render a Galaxy workflow as a Mermaid flowchart diagram")
    .argument("<file>", "Workflow file (.ga, .gxwf.yml)")
    .argument(
      "[output]",
      "Output path (.mmd for raw, .md for fenced code block); stdout if omitted",
    )
    .option("--comments", "Render frame comments as Mermaid subgraphs")
    .action((file: string, output: string | undefined, opts: { comments?: boolean }) =>
      runMermaid(file, { output, comments: opts.comments }),
    );

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
      .option("--json", "Output structured JSON report")
      .option("--report-markdown [file]", "Write Markdown report to file (or stdout if omitted)")
      .option("--report-html [file]", "Write HTML report to file (or stdout if omitted)"),
  ).action(runValidateTree);

  addStrictOptions(
    program
      .command("lint-tree")
      .description("Batch lint all workflows under a directory")
      .argument("<dir>", "Directory to scan for workflows")
      .option("--skip-best-practices", "Skip annotation/creator/license/label checks")
      .option(
        "--skip-state-validation",
        "Skip tool state validation against cached tool definitions",
      )
      .option("--cache-dir <dir>", "Tool cache directory (for state validation)")
      .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
      .option("--json", "Output structured JSON report")
      .option("--report-markdown [file]", "Write Markdown report to file (or stdout if omitted)")
      .option("--report-html [file]", "Write HTML report to file (or stdout if omitted)"),
  ).action(runLintTree);

  program
    .command("clean-tree")
    .description("Batch clean all workflows under a directory")
    .argument("<dir>", "Directory to scan for workflows")
    .option("--output-dir <dir>", "Write cleaned workflows to directory (mirrors source tree)")
    .option("--format <fmt>", "Force format: native or format2 (auto-detected by default)")
    .option("--json", "Output structured JSON report")
    .option("--report-markdown [file]", "Write Markdown report to file (or stdout if omitted)")
    .option("--report-html [file]", "Write HTML report to file (or stdout if omitted)")
    .option("--skip-uuid", "Skip stripping uuid fields (errors are always stripped)")
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
      .option("--brief", "Omit per-file lines; print only the aggregate summary")
      .option("--report-markdown [file]", "Write Markdown report to file (or stdout if omitted)")
      .option("--report-html [file]", "Write HTML report to file (or stdout if omitted)"),
  ).action(runRoundtripTree);

  program
    .command("validate-tests-tree")
    .description(
      "Batch validate workflow-test files (*-tests.yml / *.gxwf-tests.yml) under a directory",
    )
    .argument("<dir>", "Directory to scan for test files")
    .option("--json", "Output structured JSON report")
    .option(
      "--auto-workflow",
      "Pair each tests file with a sibling workflow by filename convention (foo.gxwf-tests.yml ↔ foo.gxwf.yml/foo.ga) and cross-check inputs/outputs",
    )
    .action(runValidateTestsTree);

  program
    .command("tool-search")
    .description("Search the Galaxy Tool Shed for tools matching a query")
    .argument("<query>", "Search text (e.g. 'fastqc')")
    .option("--page-size <n>", "Server-side page size", "20")
    .option("--max-results <n>", "Hard cap on hits returned", "50")
    .option("--page <n>", "Starting page (1-indexed)", "1")
    .option("--owner <user>", "Filter hits to a single repo owner (client-side)")
    .option("--match-name", "Drop hits where the query is not a token in the tool name")
    .option("--json", "Emit machine-readable JSON envelope")
    .option(
      "--enrich",
      "Resolve each hit's ParsedTool and attach it as `parsedTool` (one fetch per hit; off by default)",
    )
    .option(
      "--cache-dir <dir>",
      "Tool cache directory (used by --enrich; shared with galaxy-tool-cache)",
    )
    .action(runToolSearch);

  program
    .command("tool-versions")
    .description("List TRS-published versions of a Tool Shed tool (newest last)")
    .argument("<tool-id>", "TRS id (owner~repo~tool_id) or pretty form (owner/repo/tool_id)")
    .option("--json", "Emit machine-readable JSON envelope")
    .option("--latest", "Print only the latest version")
    .action(runToolVersions);

  program
    .command("tool-revisions")
    .description(
      "List changeset revisions that publish a Tool Shed tool (ordered oldest→newest). " +
        "Use for reproducible (name, owner, changeset_revision) workflow pins. " +
        "Caveat: version strings are not monotonic — the same version can appear in multiple changesets.",
    )
    .argument("<tool-id>", "TRS id (owner~repo~tool_id) or pretty form (owner/repo/tool_id)")
    .option("--tool-version <v>", "Restrict to revisions that publish this exact tool version")
    .option("--latest", "Print only the newest matching revision")
    .option("--json", "Emit machine-readable JSON envelope")
    .action(runToolRevisions);

  program
    .command("repo-search")
    .description(
      "Search the Galaxy Tool Shed for repositories. Ranking is popularity-boosted; supports server-side --owner / --category filters via reserved keywords.",
    )
    .argument("<query>", "Search text (e.g. 'fastqc')")
    .option("--page-size <n>", "Server-side page size", "20")
    .option("--max-results <n>", "Hard cap on hits returned", "50")
    .option("--page <n>", "Starting page (1-indexed)", "1")
    .option("--owner <user>", "Restrict to a single owner (server-side `owner:` keyword)")
    .option("--category <name>", "Restrict to a category (server-side `category:` keyword)")
    .option("--json", "Emit machine-readable JSON envelope")
    .action(runRepoSearch);

  return program;
}
