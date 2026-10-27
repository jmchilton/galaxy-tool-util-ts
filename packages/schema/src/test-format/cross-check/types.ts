/**
 * Canonical DTOs for workflow cross-check. Shared with the VS Code plugin so
 * extractors + the comparator can be reused; plugin keeps AST ranges.
 *
 * `type` is stringified whatever the workflow declares ("File", "data",
 * "int", "integer", "string", ...). Callers should not canonicalize — the
 * vocabulary is semi-open and differs subtly between native and format2.
 */

export type WorkflowDataType =
  | "boolean"
  | "collection"
  | "color"
  | "data"
  | "double"
  | "File"
  | "float"
  | "int"
  | "integer"
  | "long"
  | "null"
  | "string"
  | "text"
  | (string & {});

export interface WorkflowInput {
  name: string;
  doc?: string;
  type: WorkflowDataType;
  default?: unknown;
  optional?: boolean;
  /** Datatype extensions a data input accepts. */
  format?: string[];
  /** Declared `collection_type` of a collection input. */
  collectionType?: string;
}

export interface WorkflowOutput {
  name: string;
  doc?: string;
  uuid?: string;
  type?: WorkflowDataType;
  /**
   * Resolved shape: a collection type, `null` for a dataset, absent when
   * unknown. Extractors leave it absent; callers with tool info fill it.
   */
  collectionType?: string | null;
}
