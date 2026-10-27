import {
  CollectionTypeDescription,
  producesAcceptableDatatype,
  type DatatypesMapperModel,
} from "@galaxy-tool-util/workflow-graph";

import type { TestFormatDiagnostic } from "../validate.js";
import { asRecord, asString } from "./coerce.js";
import { isCompatibleType, jsTypeOf } from "./type-compat.js";
import type { WorkflowInput, WorkflowOutput } from "./types.js";

/**
 * JSON-pointer escaping per RFC 6901 — `~` → `~0`, `/` → `~1`.
 */
function jptrEscape(s: string): string {
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

function jptr(parts: (string | number)[]): string {
  return "/" + parts.map((p) => jptrEscape(String(p))).join("/");
}

const DATASET_INPUT_TYPES = new Set(["data", "data_input", "File"]);
const COLLECTION_INPUT_TYPES = new Set(["collection", "data_collection", "data_collection_input"]);

export interface WorkflowShape {
  inputs: WorkflowInput[];
  outputs: WorkflowOutput[];
}

export interface CrossCheckOptions {
  /** Enables `filetype` vs declared `format` checks. */
  datatypes?: DatatypesMapperModel;
}

/**
 * Cross-check a parsed tests document against workflow inputs/outputs. Emits
 * one diagnostic per violation with a JSON-pointer path into the tests doc
 * (matches Ajv's `instancePath`). Keywords:
 *
 *   workflow_input_undefined           job key not declared in workflow
 *   workflow_input_required            required workflow input missing from job (and no default)
 *   workflow_input_type                job value's JS type incompatible with declared type
 *   workflow_input_kind                File bound to a collection input or vice versa
 *   workflow_input_collection_type     collection_type the input cannot accept
 *   workflow_input_collection_map_over (warning) collection_type would map over the input
 *   workflow_input_format              (warning) filetype outside the declared format
 *   workflow_output_undefined          output assertion name not declared in workflow
 *   workflow_output_kind               dataset assertion on a collection output or vice versa
 *   workflow_output_collection_type    asserted collection_type differs from the resolved one
 */
export function checkTestsAgainstWorkflow(
  testsDoc: unknown,
  workflow: WorkflowShape,
  options: CrossCheckOptions = {},
): TestFormatDiagnostic[] {
  if (!Array.isArray(testsDoc)) return [];
  const inputByName = new Map(workflow.inputs.map((i) => [i.name, i]));
  const outputByName = new Map(workflow.outputs.map((o) => [o.name, o]));
  const diagnostics: TestFormatDiagnostic[] = [];

  for (let testIdx = 0; testIdx < testsDoc.length; testIdx++) {
    const entry = asRecord(testsDoc[testIdx]);
    if (!entry) continue;
    const job = asRecord(entry.job) ?? {};
    const outputs = asRecord(entry.outputs) ?? {};

    // Inputs: flag unknowns, check types.
    for (const [name, value] of Object.entries(job)) {
      const declared = inputByName.get(name);
      if (!declared) {
        diagnostics.push({
          path: jptr([testIdx, "job", name]),
          message: `Input '${name}' is not defined in the associated workflow.`,
          keyword: "workflow_input_undefined",
          params: { input: name },
        });
        continue;
      }
      const actualType = jsTypeOf(value);
      if (!isCompatibleType(declared.type, actualType)) {
        diagnostics.push({
          path: jptr([testIdx, "job", name]),
          message: `Input '${name}' has an invalid type. Expected '${declared.type}' but found '${actualType}'.`,
          keyword: "workflow_input_type",
          params: { input: name, declaredType: declared.type, actualType },
        });
        continue;
      }
      diagnostics.push(...checkInputKind([testIdx, "job", name], declared, value, options));
    }

    // Inputs: flag required ones missing from the job.
    for (const declared of workflow.inputs) {
      if (declared.optional === true) continue;
      if (declared.default !== undefined) continue;
      if (Object.prototype.hasOwnProperty.call(job, declared.name)) continue;
      diagnostics.push({
        path: jptr([testIdx, "job"]),
        message: `Input '${declared.name}' is required but no value or default was provided.`,
        keyword: "workflow_input_required",
        params: { input: declared.name },
      });
    }

    // Outputs: flag assertions for outputs the workflow doesn't declare.
    for (const [name, assertion] of Object.entries(outputs)) {
      const declared = outputByName.get(name);
      if (!declared) {
        diagnostics.push({
          path: jptr([testIdx, "outputs", name]),
          message: `Output '${name}' is not defined in the associated workflow.`,
          keyword: "workflow_output_undefined",
          params: { output: name },
        });
        continue;
      }
      diagnostics.push(...checkOutputKind([testIdx, "outputs", name], declared, assertion));
    }
  }

  return diagnostics;
}

function checkInputKind(
  pathParts: (string | number)[],
  declared: WorkflowInput,
  value: unknown,
  options: CrossCheckOptions,
): TestFormatDiagnostic[] {
  const job = asRecord(value);
  if (!job) return [];
  const name = declared.name;
  const isCollection = job.class === "Collection";
  const isFile = job.class === "File";

  if (
    (isCollection && DATASET_INPUT_TYPES.has(declared.type)) ||
    (isFile && COLLECTION_INPUT_TYPES.has(declared.type))
  ) {
    const expected = isCollection ? "a dataset" : "a collection";
    return [
      {
        path: jptr(pathParts),
        message: `Input '${name}' expects ${expected} but the job provides class '${job.class}'.`,
        keyword: "workflow_input_kind",
        params: { input: name, declaredType: declared.type, actualClass: job.class },
      },
    ];
  }

  const actualCollectionType = asString(job.collection_type);
  if (isCollection && declared.collectionType && actualCollectionType) {
    const accepted = new CollectionTypeDescription(declared.collectionType);
    const actual = new CollectionTypeDescription(actualCollectionType);
    if (accepted.accepts(actual)) return [];
    const params = { input: name, declared: declared.collectionType, actual: actualCollectionType };
    if (actual.canMapOver(accepted)) {
      return [
        {
          path: jptr([...pathParts, "collection_type"]),
          message: `Input '${name}' declares collection_type '${declared.collectionType}'; a '${actualCollectionType}' collection would map over it.`,
          keyword: "workflow_input_collection_map_over",
          params,
          severity: "warning",
        },
      ];
    }
    return [
      {
        path: jptr([...pathParts, "collection_type"]),
        message: `Input '${name}' declares collection_type '${declared.collectionType}' but the job provides '${actualCollectionType}'.`,
        keyword: "workflow_input_collection_type",
        params,
      },
    ];
  }

  const filetype = asString(job.filetype);
  const { datatypes } = options;
  if (isFile && datatypes && declared.format && filetype && filetype !== "auto") {
    if (producesAcceptableDatatype(datatypes, declared.format, [filetype]).canAccept) return [];
    const known = filetype in datatypes.datatypesMapping.ext_to_class_name;
    return [
      {
        path: jptr([...pathParts, "filetype"]),
        message: known
          ? `Input '${name}' accepts format(s) [${declared.format.join(", ")}] but the job provides filetype '${filetype}'.`
          : `Input '${name}' has filetype '${filetype}', which is not a known Galaxy datatype.`,
        keyword: "workflow_input_format",
        params: { input: name, format: declared.format, filetype, known },
        severity: "warning",
      },
    ];
  }
  return [];
}

function checkOutputKind(
  pathParts: (string | number)[],
  declared: WorkflowOutput,
  assertion: unknown,
): TestFormatDiagnostic[] {
  const resolved = declared.collectionType;
  const expected = asRecord(assertion);
  if (resolved === undefined || !expected) return [];
  const name = declared.name;
  const assertsCollection = expected.class === "Collection";

  if (resolved === null && assertsCollection) {
    return [
      {
        path: jptr(pathParts),
        message: `Output '${name}' is a dataset but is asserted as a collection.`,
        keyword: "workflow_output_kind",
        params: { output: name, collectionType: null },
      },
    ];
  }
  if (resolved !== null && !assertsCollection) {
    return [
      {
        path: jptr(pathParts),
        message: `Output '${name}' is a '${resolved}' collection but is asserted as a dataset; use class: Collection.`,
        keyword: "workflow_output_kind",
        params: { output: name, collectionType: resolved },
      },
    ];
  }
  const assertedType = asString(expected.collection_type);
  if (resolved !== null && assertedType && assertedType !== resolved) {
    return [
      {
        path: jptr([...pathParts, "collection_type"]),
        message: `Output '${name}' is a '${resolved}' collection but collection_type '${assertedType}' is asserted.`,
        keyword: "workflow_output_collection_type",
        params: { output: name, declared: resolved, actual: assertedType },
      },
    ];
  }
  return [];
}
