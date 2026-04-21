// Format-aware serialization helpers
export { serializeWorkflow, resolveFormat, type SerializeWorkflowOptions } from "./serialize.js";

// Raw (generated) workflow schema types
export {
  type GalaxyWorkflow,
  GalaxyWorkflowSchema,
  type NativeGalaxyWorkflow,
  NativeGalaxyWorkflowSchema,
} from "./raw/index.js";

// Normalized workflow types + normalizers
export {
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
  normalizedNative,
  NormalizedNativeWorkflowSchema,
  NormalizedNativeStepSchema,
  ToolReferenceSchema,
  type NormalizedNativeWorkflow,
  type NormalizedNativeStep,
  type ToolReference,
  toFormat2,
  type ToFormat2Options,
  type Format2StateOverride,
  toNative,
  type ToNativeOptions,
  toFormat2Stateful,
  toNativeStateful,
  type StepConversionStatus,
  type StepConversionFailureClass,
  type StatefulExportResult,
  type StatefulNativeResult,
  type ToolInputsResolver,
  ensureFormat2,
  ensureNative,
  expandedFormat2,
  expandedNative,
  isTrsUrl,
  MAX_EXPANSION_DEPTH,
  type ExpandedFormat2Workflow,
  type ExpandedFormat2Step,
  type ExpandedNativeWorkflow,
  type ExpandedNativeStep,
  type RefResolver,
  type ExpansionOptions,
  flattenCommentData,
  unflattenCommentData,
  resolveSourceReference,
  UNLABELED_INPUT_PREFIX,
  UNLABELED_STEP_PREFIX,
} from "./normalized/index.js";

export {
  flatStatePath,
  keysStartingWith,
  repeatInputsToArray,
  selectWhichWhen,
} from "./walk-helpers.js";

export { injectConnectionsIntoState, stripConnectedValues } from "./state-merge.js";

export { expandToolStateDefaults } from "./fill-defaults.js";

export { scanForReplacements, type ReplacementClassification } from "./replacement-scan.js";

export {
  scanToolState,
  type LegacyEncodingClassification,
  type LegacyEncodingHit,
  type LegacyEncodingScanResult,
} from "./legacy-encoding.js";

export {
  walkNativeState,
  walkFormat2State,
  SKIP_VALUE,
  UnknownKeyError,
  type LeafCallback,
  type WalkNativeOptions,
} from "./walker.js";

export {
  convertScalarValue,
  reverseScalarValue,
  convertStateToFormat2,
  encodeStateToNative,
  type Format2ConvertedState,
} from "./stateful-convert.js";

export {
  precheckNativeWorkflow,
  precheckNativeStep,
  type PrecheckResult,
  type StepPrecheckResult,
} from "./precheck.js";

export {
  ConversionValidationFailure,
  validateNativeStepState,
  validateFormat2StepState,
  validateFormat2StepStateStrict,
  type ToolStateDiagnostic,
  type ValidationPhase,
} from "./stateful-validate.js";

export { findParamAtPath, type ParamNavigationResult } from "./param-navigation.js";

export {
  roundtripValidate,
  type RoundtripResult,
  type RoundtripStrictOptions,
  type StepRoundtripResult,
  type BenignArtifactKind,
  type RoundtripFailureClass,
} from "./roundtrip.js";

export { cleanWorkflow, type CleanWorkflowOptions, type CleanWorkflowResult } from "./clean.js";

export { detectFormat, type WorkflowFormat } from "./detect-format.js";

export {
  withClass,
  validateFormat2,
  validateFormat2Strict,
  validateNative,
  validateNativeStrict,
  validatorForFixture,
} from "./validators.js";

export {
  validateEncodingNative,
  validateEncodingFormat2,
  checkStrictEncoding,
  checkStrictStructure,
} from "./strict-checks.js";

export {
  LintContext,
  LintMessage,
  Linter,
  LEVEL_ERROR,
  LEVEL_WARN,
  lintNative,
  lintFormat2,
  lintWorkflow,
  lintBestPracticesFormat2,
  lintBestPracticesNative,
  type LintLevel,
  type LintResult,
  type LinterRef,
  type EmitOptions,
} from "./lint.js";

export { NativeStepKeyNotInteger } from "./lint-rules.js";

export {
  parseLintProfiles,
  lintProfilesById,
  rulesForProfile,
  iwcRuleIds,
  LINT_PROFILES_FILENAME,
  IWC_PROFILE_NAMES,
  type LintProfile,
} from "./lint-profiles.js";

// Structured report models (mirrors Python _report_models.py)
export {
  type StepStatus,
  SKIP_STATUSES,
  type ValidationStepResult,
  type CleanStepResult,
  // Connection validation
  type ResolvedOutputType,
  type ConnectionResult,
  type ConnectionStepResult,
  type ConnectionValidationReport,
  // Workflow discovery
  type WorkflowEntry,
  type WorkflowIndex,
  // Single-workflow wrappers
  type SingleValidationReport,
  type SingleLintReport,
  type SingleCleanReport,
  // Round-trip validation
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
  // Export / to-native
  type SingleExportReport,
  type StepEncodeStatus,
  type ToNativeResult,
  // API result wrappers
  type WorkflowSourceFormat,
  type ExportResult,
  type ConvertResult,
  // Tree-level types (TS-only)
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
} from "./report-models.js";
