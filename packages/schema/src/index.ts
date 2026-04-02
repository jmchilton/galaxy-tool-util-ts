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
  type ToolParameterBundleModel,
} from "./schema/index.js";

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
} from "./workflow/index.js";
