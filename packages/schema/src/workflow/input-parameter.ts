/**
 * Resolve Format2 input `type` strings to their Effect input parameter schemas.
 *
 * Mirrors gxformat2/schema/_input_parameter.py and the `pydantic:discriminator_map`
 * on `Process.inputs` in schema-sources/v19_09/Process.yml.
 */

import {
  WorkflowBooleanParameterSchema,
  WorkflowCollectionParameterSchema,
  WorkflowColorParameterSchema,
  WorkflowDataParameterSchema,
  WorkflowDirectoryUriParameterSchema,
  WorkflowFloatParameterSchema,
  WorkflowIntegerParameterSchema,
  WorkflowTextParameterSchema,
} from "./raw/gxformat2.effect.js";

const INPUT_TYPE_TO_SCHEMA = {
  data: WorkflowDataParameterSchema,
  File: WorkflowDataParameterSchema,
  data_input: WorkflowDataParameterSchema,
  collection: WorkflowCollectionParameterSchema,
  data_collection: WorkflowCollectionParameterSchema,
  data_collection_input: WorkflowCollectionParameterSchema,
  integer: WorkflowIntegerParameterSchema,
  int: WorkflowIntegerParameterSchema,
  text: WorkflowTextParameterSchema,
  string: WorkflowTextParameterSchema,
  float: WorkflowFloatParameterSchema,
  boolean: WorkflowBooleanParameterSchema,
  color: WorkflowColorParameterSchema,
  directory_uri: WorkflowDirectoryUriParameterSchema,
} as const;

type InputParameterSchema = (typeof INPUT_TYPE_TO_SCHEMA)[keyof typeof INPUT_TYPE_TO_SCHEMA];

export const INPUT_TYPES: ReadonlySet<string> = new Set(Object.keys(INPUT_TYPE_TO_SCHEMA));

/** Input parameter schema for a Format2 type string; data for unknown or missing types. */
export function inputParameterSchema(typeValue: string | null | undefined): InputParameterSchema {
  if (typeValue != null && Object.hasOwn(INPUT_TYPE_TO_SCHEMA, typeValue)) {
    return INPUT_TYPE_TO_SCHEMA[typeValue as keyof typeof INPUT_TYPE_TO_SCHEMA];
  }
  return WorkflowDataParameterSchema;
}

/** Format2 input type strings whose specific schema declares `field`. */
export function inputTypesDeclaring(field: string): ReadonlySet<string> {
  return inputTypesWhere((schema) => Object.hasOwn(schema.fields, field));
}

/** Format2 input type aliases of a dataset input (`data`, `File`, ...). */
export const DATA_INPUT_TYPES = inputTypesWhere((s) => s === WorkflowDataParameterSchema);
/** Format2 input type aliases of a collection input (`collection`, ...). */
export const COLLECTION_INPUT_TYPES = inputTypesWhere(
  (s) => s === WorkflowCollectionParameterSchema,
);

function inputTypesWhere(
  predicate: (schema: InputParameterSchema) => boolean,
): ReadonlySet<string> {
  return new Set(
    Object.entries(INPUT_TYPE_TO_SCHEMA)
      .filter(([, schema]) => predicate(schema))
      .map(([type]) => type),
  );
}
