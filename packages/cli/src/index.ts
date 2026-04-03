/**
 * @module @galaxy-tool-util/cli
 *
 * CLI command implementations for `galaxy-tool-cache`.
 * Each function corresponds to a CLI subcommand and can also be called programmatically.
 */

/** Fetch a tool from ToolShed/Galaxy and save to the local cache. */
export { runAdd } from "./commands/add.js";
/** List all tools in the local cache. */
export { runList } from "./commands/list.js";
/** Display metadata for a cached tool. */
export { runInfo } from "./commands/info.js";
/** Clear cached tools, optionally filtered by ID prefix. */
export { runClear } from "./commands/clear.js";
/** Export a JSON Schema for a cached tool's parameters at a given state representation. */
export { runSchema } from "./commands/schema.js";
/** Validate a Galaxy workflow file (structure + optional tool state). */
export { runValidateWorkflow } from "./commands/validate-workflow.js";
/** Clean a Galaxy workflow — strip stale keys and decode legacy encoding. */
export { runClean } from "./commands/clean.js";
/** Lint a Galaxy workflow — structural checks, best practices, tool state validation. */
export { runLint } from "./commands/lint.js";
/** Convert a Galaxy workflow between native and format2 formats. */
export { runConvert } from "./commands/convert.js";
