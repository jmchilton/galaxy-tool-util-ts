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
/** Validate a workflow-test file (*-tests.yml / *.gxwf-tests.yml). */
export { runValidateTests } from "./commands/validate-tests.js";
export type { ValidateTestsOptions, ValidateTestsReport } from "./commands/validate-tests.js";
/** Batch-validate workflow-test files under a directory. */
export { runValidateTestsTree } from "./commands/validate-tests-tree.js";
export type {
  ValidateTestsTreeOptions,
  ValidateTestsTreeReport,
} from "./commands/validate-tests-tree.js";
/** Validate a user-defined Galaxy tool source YAML (class: GalaxyUserTool / GalaxyTool). */
export { runValidateToolSource } from "./commands/validate-tool-source.js";
export type {
  ValidateToolSourceOptions,
  ValidateToolSourceReport,
} from "./commands/validate-tool-source.js";
/** Batch-validate user-defined Galaxy tool source YAMLs under a directory. */
export { runValidateToolSourceTree } from "./commands/validate-tool-source-tree.js";
export type {
  ValidateToolSourceTreeOptions,
  ValidateToolSourceTreeReport,
} from "./commands/validate-tool-source-tree.js";
/** Clean a Galaxy workflow — strip stale keys and decode legacy encoding. */
export { runClean } from "./commands/clean.js";
/** Lint a Galaxy workflow — structural checks, best practices, tool state validation. */
export { runLint, lintWorkflowReport } from "./commands/lint.js";
export type { LintReport, LintReportOptions } from "./commands/lint.js";
/** Convert a Galaxy workflow between native and format2 formats. */
export { runConvert } from "./commands/convert.js";
/** Scan a workflow and cache all referenced tools. */
export { runPopulateWorkflow } from "./commands/populate-workflow.js";
/** Export the structural JSON Schema for Galaxy workflows. */
export { runStructuralSchema } from "./commands/structural-schema.js";
/** Batch validate all workflows under a directory. */
export { runValidateTree } from "./commands/validate-tree.js";
/** Batch lint all workflows under a directory. */
export { runLintTree } from "./commands/lint-tree.js";
/** Batch clean all workflows under a directory. */
export { runCleanTree } from "./commands/clean-tree.js";
/** Batch convert all workflows under a directory. */
export { runConvertTree } from "./commands/convert-tree.js";
/** Tree orchestrator infrastructure. */
export {
  discoverWorkflows,
  collectTree,
  summarizeOutcomes,
  skipWorkflow,
  loadWorkflowSafe,
} from "./commands/tree.js";
export type { WorkflowInfo, WorkflowOutcome, TreeResult, TreeSummary } from "./commands/tree.js";
/** Render step validation results to console. */
export { renderStepResults } from "./commands/render-results.js";
/** Write workflow content to file or stdout. */
export { writeWorkflowOutput } from "./commands/workflow-io.js";
/** Validate native/format2 workflow steps programmatically (no CLI I/O). */
export {
  validateNativeSteps,
  validateFormat2Steps,
  decodeStructureErrors,
  detectEncodingErrors,
} from "./commands/validate-workflow.js";
/** Preload tool inputs from a ToolCache into a synchronous ToolInputsResolver. */
export { loadToolInputsForWorkflow } from "./commands/stateful-tool-inputs.js";
export type { ToolLoadStatus, LoadedToolInputs } from "./commands/stateful-tool-inputs.js";
/** Default subworkflow ref resolver (base64, TRS, HTTP, file paths). */
export { createDefaultResolver } from "./commands/url-resolver.js";
/** Build the edge-annotation lookup the visualizers consume. */
export {
  resolveEdgeAnnotations,
  resolveEdgeAnnotationsWithCache,
  resolveEdgeAnnotationsAndSpecsWithCache,
} from "./commands/annotate-connections.js";
export type { ResolvedToolSpec } from "./commands/annotate-connections.js";
/** JSON-Schema-based (AJV) step validation and structural error decoding. */
export {
  validateNativeStepsJsonSchema,
  validateFormat2StepsJsonSchema,
  decodeStructureErrorsJsonSchema,
} from "./commands/validate-workflow-json-schema.js";
