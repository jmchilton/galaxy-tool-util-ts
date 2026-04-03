import * as S from "effect/Schema";
import type { DataCollectionParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import {
  usesStringIds,
  isWorkflowStep,
  isTestCase,
  allowsConnectedOrRuntimeValue,
} from "../state-representations.js";
import { ConnectedOrRuntimeValueSchema } from "../model-factory.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

/**
 * Determine if a collection type uses array elements (list-like) or record elements (paired/record-like).
 */
function isArrayElementType(ct: string): boolean {
  return ct === "list" || ct.startsWith("list:") || ct === "sample_sheet";
}

/**
 * Build a job_runtime Collection schema variant for a specific collection_type.
 */
function collectionVariant(ctLiteral: S.Schema.Any, elementsSchema: S.Schema.Any): S.Schema.Any {
  return S.Struct({
    class: S.Literal("Collection"),
    name: S.String,
    collection_type: ctLiteral,
    tags: S.Array(S.Unknown),
    elements: elementsSchema,
    // Optional fields present on some collection types
    column_definitions: S.optional(S.Array(S.Unknown)),
    has_single_item: S.optional(S.Boolean),
  });
}

/**
 * Build the elements schema for a single (non-comma-separated) collection type.
 * Handles nesting like "list:paired" recursively.
 */
function elementsSchemaForType(ct: string): S.Schema.Any {
  const colonIdx = ct.indexOf(":");
  if (colonIdx === -1) {
    // Leaf type
    if (ct === "paired") {
      // Paired requires forward + reverse keys (use Object to reject undefined/missing)
      return S.Struct({
        forward: S.Object,
        reverse: S.Object,
      });
    }
    if (isArrayElementType(ct)) {
      return S.Array(S.Unknown);
    }
    // record, paired_or_unpaired — accept any record
    return S.Record({ key: S.String, value: S.Unknown });
  }

  // Nested: e.g., "list:paired" → outer is list (array), inner is a Collection of type "paired"
  const innerType = ct.slice(colonIdx + 1);
  const innerSchema = collectionVariant(S.Literal(innerType), elementsSchemaForType(innerType));
  return S.Array(innerSchema);
}

/**
 * Build schema for test_case collection elements.
 * Recursive: elements can be File or nested Collection.
 */
function buildTestCaseCollectionSchema(): S.Schema.Any {
  const testCaseFile = S.Struct({
    class: S.Literal("File"),
    identifier: S.String,
    path: S.String,
  });

  // Recursive element type: File or nested Collection
  type TestCaseElement = S.Schema.Any;
  const testCaseElement: TestCaseElement = S.Union(
    testCaseFile,
    S.suspend(
      (): S.Schema.Any =>
        S.Struct({
          class: S.Literal("Collection"),
          collection_type: S.String,
          identifier: S.optional(S.String),
          elements: S.Array(testCaseElement),
        }),
    ),
  );

  return S.Struct({
    class: S.Literal("Collection"),
    collection_type: S.String,
    name: S.optional(S.String),
    elements: S.Array(testCaseElement),
  });
}

function buildJobRuntimeCollectionSchema(collectionType: string | null): S.Schema.Any {
  if (collectionType === null) {
    // Any collection type — permissive
    return collectionVariant(
      S.String,
      S.Union(S.Array(S.Unknown), S.Record({ key: S.String, value: S.Unknown })),
    );
  }

  // Split "list,paired" into individual allowed types
  const types = collectionType.split(",").map((t) => t.trim());
  const variants = types.map((ct) => collectionVariant(S.Literal(ct), elementsSchemaForType(ct)));

  return variants.length === 1 ? variants[0] : S.Union(...variants);
}

function generateDataCollectionSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as DataCollectionParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any;

  let connectedValueHandled = false;

  if (allowsConnectedOrRuntimeValue(stateRep)) {
    // Native: ConnectedValue or RuntimeValue only
    schema = ConnectedOrRuntimeValueSchema;
    if (p.optional) {
      schema = S.NullOr(schema);
    }
    connectedValueHandled = true;
  } else if (isWorkflowStep(stateRep)) {
    // workflow_step: absent only. workflow_step_linked: ConnectedValue (added centrally).
    schema = S.Never.annotations({ jsonSchema: { not: {} } }) as unknown as S.Schema.Any;
  } else if (isTestCase(stateRep)) {
    schema = buildTestCaseCollectionSchema();
  } else if (stateRep === "job_runtime") {
    schema = buildJobRuntimeCollectionSchema(p.collection_type);
  } else {
    const idSchema: S.Schema.Any = usesStringIds(stateRep) ? S.String : S.Int;

    // HDCA reference
    const hdcaSource = S.Struct({ src: S.Literal("hdca"), id: idSchema });

    // Inline collection definition
    const inlineCollection = S.Struct({
      class: S.Literal("Collection"),
      collection_type: S.String,
      elements: S.Array(S.Unknown),
    });

    const parts: S.Schema.Any[] = [hdcaSource];

    // job_internal also allows dce source
    if (stateRep === "job_internal") {
      const dceSource = S.Struct({ src: S.Literal("dce"), id: idSchema });
      parts.push(dceSource);
    }

    // Inline collection valid for most reps (not request_internal_dereferenced or job_internal)
    if (stateRep !== "request_internal_dereferenced" && stateRep !== "job_internal") {
      parts.push(inlineCollection);
    }

    schema = parts.length === 1 ? parts[0] : S.Union(...parts);
  }

  if (p.optional && !isWorkflowStep(stateRep) && !connectedValueHandled) {
    schema = S.NullOr(schema);
  }

  // workflow_step: data always optional (absent only)
  let isOptional: boolean;
  if (stateRep === "workflow_step") {
    isOptional = true;
  } else {
    const requestRequiresValue = !p.optional;
    isOptional = computeIsOptional(stateRep, requestRequiresValue);
  }

  return { name, alias, schema, isOptional, connectedValueHandled };
}

registerParameterType("gx_data_collection", generateDataCollectionSchema);
