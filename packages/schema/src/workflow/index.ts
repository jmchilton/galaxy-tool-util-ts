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
  type ValidationPhase,
} from "./stateful-validate.js";

export {
  roundtripValidate,
  type RoundtripResult,
  type StepRoundtripResult,
  type StepDiff,
  type DiffSeverity,
  type BenignArtifactKind,
  type RoundtripFailureClass,
} from "./roundtrip.js";

export { cleanWorkflow } from "./clean.js";

export { detectFormat, type WorkflowFormat } from "./detect-format.js";

export {
  LintContext,
  lintNative,
  lintFormat2,
  lintWorkflow,
  lintBestPracticesFormat2,
  lintBestPracticesNative,
  type LintResult,
} from "./lint.js";
