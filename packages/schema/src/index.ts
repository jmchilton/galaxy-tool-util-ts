/**
 * @module @galaxy-tool-util/schema
 *
 * Effect Schema definitions for Galaxy tool parameter types and workflow models.
 * Generates typed schemas that validate tool state and export to JSON Schema.
 */

export {
  /** Build an Effect Schema for a tool parameter bundle at a given state representation. */
  createFieldModel,
  type StateRepresentation,
  /** All valid state representation names. */
  STATE_REPRESENTATIONS,
  /** Check whether a parameter type has a registered schema generator. */
  isParameterTypeRegistered,
  /** Set of all parameter types with registered generators. */
  registeredParameterTypes,
  /** Check whether a validator type has a registered schema generator. */
  isValidatorTypeRegistered,
  /** Set of all validator types with registered generators. */
  registeredValidatorTypes,
  /** Extract the set of parameter types used in a tool bundle. */
  collectParameterTypes,
  /** Extract the set of validator types used in a tool bundle. */
  collectValidatorTypes,
} from "./schema/index.js";

export {
  /** Top-level bundle of tool parameters. */
  type ToolParameterBundleModel,
  /** Union of all tool parameter types (discriminated on parameter_type). */
  type ToolParameterModel,
  /** Union of leaf (non-container) Galaxy parameter types. */
  type GalaxyParameterModel,
  /** Union of container parameter types (section, repeat, conditional). */
  type ContainerParameterModel,
  /** Base fields shared by all leaf Galaxy parameter types. */
  type BaseGalaxyParameterModel,
  type IntegerParameterModel,
  type FloatParameterModel,
  type TextParameterModel,
  type SelectParameterModel,
  type GenomeBuildParameterModel,
  type DrillDownParameterModel,
  type BooleanParameterModel,
  type SectionParameterModel,
  type RepeatParameterModel,
  type ConditionalParameterModel,
  /** A single branch of a ConditionalParameterModel. */
  type ConditionalWhen,
  /** A label/value pair used in select and genomebuild options. */
  type LabelValue,
} from "./schema/bundle-types.js";

export {
  /** True for gx_select, gx_genomebuild, gx_drill_down — params with an options list. */
  isSelectLikeParam,
  isBooleanParam,
  isSectionParam,
  isRepeatParam,
  isConditionalParam,
} from "./schema/type-guards.js";

export { ParsedTool, HelpContent, XrefDict, Citation } from "./schema/parsed-tool.js";

export {
  type GalaxyWorkflow,
  /** Union schema accepting any Galaxy workflow format (format2 or native). */
  GalaxyWorkflowSchema,
  type NativeGalaxyWorkflow,
  /** Schema for raw native (.ga) Galaxy workflows. */
  NativeGalaxyWorkflowSchema,
  /** Normalize a raw format2 workflow — fills defaults, resolves implicit fields. */
  normalizedFormat2,
  NormalizedFormat2WorkflowSchema,
  NormalizedFormat2StepSchema,
  NormalizedFormat2InputSchema,
  NormalizedFormat2OutputSchema,
  NormalizedFormat2StepInputSchema,
  NormalizedFormat2StepOutputSchema,
  type NormalizedFormat2Workflow,
  type NormalizedFormat2Step,
  type NormalizedFormat2Input,
  type NormalizedFormat2Output,
  type NormalizedFormat2StepInput,
  type NormalizedFormat2StepOutput,
  /** Normalize a raw native (.ga) workflow — fills defaults, resolves implicit fields. */
  normalizedNative,
  NormalizedNativeWorkflowSchema,
  NormalizedNativeStepSchema,
  ToolReferenceSchema,
  type NormalizedNativeWorkflow,
  type NormalizedNativeStep,
  type ToolReference,
  /** Merge step connection info into tool_state for validation. */
  injectConnectionsIntoState,
  /** Strip ConnectedValue markers from state using parameter tree. */
  stripConnectedValues,
  /** Expand defaults into a tool state dict (port of Python fill_static_defaults). */
  expandToolStateDefaults,
  /** Build the minimal `tool_state` for a freshly inserted step. Today returns `{}`; designated extension point. */
  buildMinimalToolState,
  /** Build a native (.ga) step skeleton for an inserted tool. */
  buildNativeStep,
  /** Build a format2 (.gxwf.yml) step skeleton for an inserted tool. */
  buildFormat2Step,
  /** Build a step skeleton for an inserted tool; dispatches on format. */
  buildStep,
  type StepSkeletonInputs,
  /** Flatten a nested parameter path to a dot-separated string. */
  flatStatePath,
  keysStartingWith,
  /** Convert repeat block inputs to arrays. */
  repeatInputsToArray,
  /** Resolve conditional parameter selections based on test values. */
  selectWhichWhen,
  /** Find ${...} replacement patterns in tool state values. */
  scanForReplacements,
  /** Normalize + async expand external subworkflow refs in a format2 workflow. */
  expandedFormat2,
  /** Normalize + async expand external subworkflow refs in a native workflow. */
  expandedNative,
  /** Check whether a string is a TRS (Tool Registry Service) URL. */
  isTrsUrl,
  MAX_EXPANSION_DEPTH,
  type ExpandedFormat2Workflow,
  type ExpandedFormat2Step,
  type ExpandedNativeWorkflow,
  type ExpandedNativeStep,
  type RefResolver,
  type ExpansionOptions,
  /** Convert native workflow to normalized Format2. */
  toFormat2,
  /** Convert Format2 workflow to normalized native. */
  toNative,
  /** Stateful native → format2 conversion using cached tool definitions. */
  toFormat2Stateful,
  /** Stateful format2 → native conversion using cached tool definitions. */
  toNativeStateful,
  type StepConversionStatus,
  type StepConversionFailureClass,
  type StatefulExportResult,
  type StatefulNativeResult,
  type ToolInputsResolver,
  /** Precheck a native workflow / step for stateful conversion compatibility. */
  precheckNativeWorkflow,
  precheckNativeStep,
  type PrecheckResult,
  type StepPrecheckResult,
  /** Effect Schema validation wrappers for stateful conversion (pre/post). */
  ConversionValidationFailure,
  validateNativeStepState,
  validateFormat2StepState,
  /** Strict format2 state validation — reports unknown keys as diagnostics. */
  validateFormat2StepStateStrict,
  type ValidationPhase,
  /** Navigate a tool parameter tree by path segments (for LSP completion/hover). */
  findParamAtPath,
  type ParamNavigationResult,
  /** Roundtrip a native workflow through format2 and back, diffing tool_state per step. */
  roundtripValidate,
  type RoundtripResult,
  type RoundtripStrictOptions,
  type StepRoundtripResult,
  type BenignArtifactKind,
  type RoundtripFailureClass,
  /** Scan native workflow tool_state for legacy parameter encoding signals. */
  scanToolState,
  type LegacyEncodingClassification,
  type LegacyEncodingHit,
  type LegacyEncodingScanResult,
  /** Clean a workflow — strip stale keys, decode legacy tool_state encoding. */
  cleanWorkflow,
  type CleanWorkflowResult,
  /** Detect whether a workflow dict is native (.ga) or format2 (.gxwf.yml). */
  detectFormat,
  type WorkflowFormat,
  /** Format-aware workflow serializer (JSON/YAML, configurable indent and newline). */
  serializeWorkflow,
  type SerializeWorkflowOptions,
  /** Resolve workflow format from an optional override, falling back to detectFormat. */
  resolveFormat,
  /** Lint context for tracking errors and warnings during workflow linting. */
  LintContext,
  /** Structured lint emission (message + level + linter + json_pointer). */
  LintMessage,
  /** Metadata-only base class for lint rules. */
  Linter,
  LEVEL_ERROR,
  LEVEL_WARN,
  /** Lint a native Galaxy workflow (.ga format). */
  lintNative,
  /** Lint a Format2 Galaxy workflow (.gxwf.yml format). */
  lintFormat2,
  /** Lint a workflow, auto-detecting format. */
  lintWorkflow,
  /** Lint best practices for a Format2 Galaxy workflow. */
  lintBestPracticesFormat2,
  /** Lint best practices for a native Galaxy workflow. */
  lintBestPracticesNative,
  type LintLevel,
  type LintResult,
  type LinterRef,
  type EmitOptions,
  /** Lint rule classes (one per rule id). */
  NativeStepKeyNotInteger,
  /** Lint profile catalog loader — parses `lint_profiles.yml`. */
  parseLintProfiles,
  lintProfilesById,
  rulesForProfile,
  iwcRuleIds,
  LINT_PROFILES_FILENAME,
  IWC_PROFILE_NAMES,
  type LintProfile,
  /** Strict encoding check — reject JSON-string tool_state (native) or tool_state field misuse (format2). */
  validateEncodingNative,
  validateEncodingFormat2,
  checkStrictEncoding,
  /** Strict structure check — reject unknown keys via onExcessProperty: "error". */
  checkStrictStructure,
  /** Inject `class` discriminator into workflow dict when missing (recursive over step subworkflows). */
  withClass,
  /** Effect-schema validator dispatch mirroring gxformat2/validators.py. */
  validateFormat2,
  validateFormat2Strict,
  validateNative,
  validateNativeStrict,
  validatorForFixture,
  // Structured report models (mirrors Python _report_models.py)
  type StepStatus,
  SKIP_STATUSES,
  type ValidationStepResult,
  type CleanStepResult,
  type ResolvedOutputType,
  type ConnectionResult,
  type ConnectionStepResult,
  type ConnectionValidationReport,
  type WorkflowEntry,
  type WorkflowIndex,
  type SingleValidationReport,
  type SingleLintReport,
  type SingleCleanReport,
  type DiffType,
  type DiffSeverity,
  type BenignArtifact,
  type StepDiff,
  type SkipWorkflowReason,
  type FailureClass,
  type StepResult,
  type RoundTripResult,
  type StepIdMappingResult,
  type RoundTripValidationResult,
  type SingleRoundTripReport,
  type SingleExportReport,
  type StepEncodeStatus,
  type ToNativeResult,
  type WorkflowSourceFormat,
  type ExportResult,
  type ConvertResult,
  type WorkflowValidationResult,
  type LintWorkflowResult,
  type WorkflowCleanResult,
  type CategoryGroup,
  type TreeValidationReport,
  type LintTreeReport,
  type TreeCleanReport,
  type WorkflowExportResult,
  type ExportTreeReport,
  type WorkflowToNativeResult,
  type ToNativeTreeReport,
  type ToolFailureMode,
  type RoundTripTreeReport,
  validationSummary,
  validationFailures,
  cleanDisplayLabel,
  categoryOf,
  groupByCategory,
  buildSingleValidationReport,
  buildSingleLintReport,
  buildSingleCleanReport,
  buildWorkflowValidationResult,
  buildLintWorkflowResult,
  buildWorkflowCleanResult,
  buildTreeValidationReport,
  buildLintTreeReport,
  buildTreeCleanReport,
  buildWorkflowExportResult,
  buildExportTreeReport,
  buildWorkflowToNativeResult,
  buildToNativeTreeReport,
  buildRoundTripTreeReport,
  type CleanWorkflowOptions,
} from "./workflow/index.js";

export { ToolStateValidator, type ToolStateDiagnostic } from "./tool-state-validator.js";

export {
  /** Validate a parsed *.gxwf-tests.yml / Planemo *-tests.yml document. */
  validateTestsFile,
  /** Raw JSON Schema synced from galaxy.tool_util_models.Tests (Python source of truth). */
  testsSchema,
  type TestFormatDiagnostic,
  /** Workflow-input DTO shared with the VS Code plugin. */
  type WorkflowInput,
  /** Workflow-output DTO shared with the VS Code plugin. */
  type WorkflowOutput,
  /** Workflow parameter type vocabulary (stringified; extractors don't canonicalize). */
  type WorkflowDataType,
  /** Workflow shape consumed by `checkTestsAgainstWorkflow`. */
  type WorkflowShape,
  /** Extract inputs from a parsed workflow dict (auto-detects format). */
  extractWorkflowInputs,
  /** Extract outputs from a parsed workflow dict (auto-detects format). */
  extractWorkflowOutputs,
  /** Format2-specific extractors (operate on raw parsed dicts, not AST). */
  extractFormat2Inputs,
  extractFormat2Outputs,
  /** Native (.ga) extractors (read step-level tool_state for default/optional). */
  extractNativeInputs,
  extractNativeOutputs,
  /** Coarse type compatibility used by cross-check; permissive default. Takes type *strings* on both sides. */
  isCompatibleType,
  /** Runtime type tag for a JS value, in the YAML-language-server AST vocabulary. */
  jsTypeOf,
  /** Cross-check a tests doc against workflow shape; emits JSON-pointer diagnostics. */
  checkTestsAgainstWorkflow,
} from "./test-format/index.js";
