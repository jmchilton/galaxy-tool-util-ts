import {
  CollectionTypeDescription,
  producesAcceptableDatatype,
  type DatatypesMapperModel,
} from "@galaxy-tool-util/workflow-graph";

import { COLLECTION_INPUT_TYPES, DATA_INPUT_TYPES } from "../../workflow/input-parameter.js";
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

const MAP_OVER = "workflow_input_collection_map_over";

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
 *   workflow_input_kind                File bound to a collection input
 *   workflow_input_collection_type     collection_type the input cannot accept
 *   workflow_input_collection_map_over (warning) collection maps over a data or collection input
 *   workflow_input_format              (warning) filetype outside the declared format
 *   workflow_output_undefined          output assertion name not declared in workflow
 *   workflow_output_kind               dataset assertion on a collection output or vice versa
 *   workflow_output_collection_type    asserted collection_type differs from the resolved one
 *
 * Output shape checks are skipped for a test whose job collections differ
 * from the declared input collection types: resolved shapes assume them.
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
    let shapesDiverge = false;

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
      shapesDiverge ||= divergesFromDeclaredShape(declared, value);
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
      if (!shapesDiverge) {
        diagnostics.push(...checkOutputKind([testIdx, "outputs", name], declared, assertion));
      }
    }
  }

  return diagnostics;
}

/** True when a job collection differs from the input type resolved output shapes assume. */
function divergesFromDeclaredShape(declared: WorkflowInput, value: unknown): boolean {
  const job = asRecord(value);
  if (job?.class !== "Collection") return false;
  if (!COLLECTION_INPUT_TYPES.has(declared.type)) return true;
  // The connection graph resolves an untyped collection input as `list`.
  return asString(job.collection_type) !== (declared.collectionType ?? "list");
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
  const actualCollectionType = asString(job.collection_type);

  if (isFile && COLLECTION_INPUT_TYPES.has(declared.type)) {
    return [
      {
        path: jptr(pathParts),
        message: `Input '${name}' expects a collection but the job provides class 'File'.`,
        keyword: "workflow_input_kind",
        params: { input: name, declaredType: declared.type, actualClass: job.class },
      },
    ];
  }
  if (isCollection && DATA_INPUT_TYPES.has(declared.type)) {
    return [
      {
        path: jptr(pathParts),
        message: `Input '${name}' is a dataset input; a${actualCollectionType ? ` '${actualCollectionType}'` : ""} collection maps the workflow over it.`,
        keyword: MAP_OVER,
        params: { input: name, declared: null, actual: actualCollectionType ?? null },
        severity: "warning",
      },
    ];
  }

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
          keyword: MAP_OVER,
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
    if (declared.format.includes(filetype)) return [];
    if (producesAcceptableDatatype(datatypes, declared.format, [filetype]).canAccept) return [];
    const known = Object.hasOwn(datatypes.datatypesMapping.ext_to_class_name, filetype);
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
  // planemo also treats `element_tests` without `class` as a collection assertion.
  const assertsCollection =
    expected.class === "Collection" || "element_tests" in expected || "elements" in expected;

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
