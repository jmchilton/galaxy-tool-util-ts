import type { CollectionTypeDescriptor } from "@galaxy-tool-util/workflow-graph";

export interface ConnectionRef {
  sourceStep: string;
  outputName: string;
  inputSubworkflowStepId?: string;
}

export type ResolvedInputType =
  | "data"
  | "collection"
  | "text"
  | "integer"
  | "float"
  | "boolean"
  | "color"
  | "select";

export interface ResolvedInput {
  name: string;
  statePath: string;
  type: ResolvedInputType;
  collectionType?: string | null;
  multiple?: boolean;
  optional?: boolean;
  extensions?: string[];
}

export type ResolvedOutputDataType =
  | "data"
  | "collection"
  | "text"
  | "integer"
  | "float"
  | "boolean";

export interface ResolvedOutput {
  name: string;
  type: ResolvedOutputDataType;
  collectionType?: string | null;
  collectionTypeSource?: string | null;
  collectionTypeFromRules?: string | null;
  structuredLike?: string | null;
  format?: string | null;
  formatSource?: string | null;
}

export interface ResolvedStep {
  stepId: string;
  label?: string | null;
  toolId?: string | null;
  toolVersion?: string | null;
  stepType: string;
  inputs: Record<string, ResolvedInput>;
  outputs: Record<string, ResolvedOutput>;
  connections: Record<string, ConnectionRef[]>;
  declaredCollectionType?: string | null;
  innerGraph?: WorkflowGraph;
  subworkflowOutputMap: Record<string, [string, string]>;
}

export interface WorkflowGraph {
  steps: Record<string, ResolvedStep>;
  sortedStepIds: string[];
}

export type ConnectionStatus = "ok" | "invalid" | "skip";

export interface ConnectionValidationResult {
  sourceStep: string;
  sourceOutput: string;
  targetStep: string;
  targetInput: string;
  status: ConnectionStatus;
  mapping?: string | null;
  /** Depth of map-over applied at this connection (0 = scalar passthrough, 1 = list, 2 = list:paired, …). */
  mapDepth?: number;
  /** True if this connection reduces a list-like source into a multi-data scalar input. */
  reduction?: boolean;
  errors: string[];
}

export interface StepConnectionResult {
  stepId: string;
  label?: string | null;
  toolId?: string | null;
  toolVersion?: string | null;
  stepType: string;
  mapOver?: string | null;
  connections: ConnectionValidationResult[];
  errors: string[];
}

export interface WorkflowConnectionResult {
  stepResults: StepConnectionResult[];
  valid: boolean;
  summary: Record<string, number>;
}

/** outputs[stepId][outputName] -> resolved type (collection descriptor for collections, sentinel for data/scalar) */
export type StepOutputTypeMap = Record<string, Record<string, CollectionTypeDescriptor>>;
