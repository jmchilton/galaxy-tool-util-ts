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
  toNative,
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
  injectConnectionsIntoState,
  stripConnectedValues,
  flatStatePath,
  keysStartingWith,
  repeatInputsToArray,
  selectWhichWhen,
} from "./state-merge.js";

export {
  scanForReplacements,
  type ReplacementClassification,
} from "./replacement-scan.js";

export {
  scanToolState,
  type LegacyEncodingClassification,
  type LegacyEncodingHit,
  type LegacyEncodingScanResult,
} from "./legacy-encoding.js";

export { cleanWorkflow } from "./clean.js";

export { detectFormat, type WorkflowFormat } from "./detect-format.js";

export {
  LintContext,
  lintNative,
  lintFormat2,
  lintWorkflow,
  type LintResult,
} from "./lint.js";
