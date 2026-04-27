export type {
  ConnectionRef,
  ResolvedInput,
  ResolvedInputType,
  ResolvedOutput,
  ResolvedOutputDataType,
  ResolvedStep,
  WorkflowGraph,
  ConnectionStatus,
  ConnectionValidationResult,
  StepConnectionResult,
  WorkflowConnectionResult,
  StepOutputTypeMap,
} from "./types.js";

export { buildWorkflowGraph } from "./graph-builder.js";
export { validateConnections, validateConnectionGraph } from "./connection-validator.js";
export { validateConnectionsReport, toConnectionValidationReport } from "./report-builder.js";
export { buildEdgeAnnotations, edgeAnnotationKey } from "./edge-annotations.js";
export type { EdgeAnnotation } from "./edge-annotations.js";
export type {
  ConnectionValidationReport,
  ConnectionStepResult,
  ConnectionResult,
  ResolvedOutputType,
} from "@galaxy-tool-util/schema";
export type { GetToolInfo } from "./get-tool-info.js";
export {
  canMatch,
  canMapOver,
  compatible,
  effectiveMapOver,
  isListLike,
  collectionTypeRank,
  isNullDesc,
  isAnyDesc,
  describe as describeCollectionType,
} from "./collection-type-functions.js";
