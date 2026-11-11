import {
  CollectionTypeDescription,
  isValidCollectionTypeStr,
  producesAcceptableDatatype,
  type DatatypesMapperModel,
} from "@galaxy-tool-util/workflow-graph";

import { COLLECTION_INPUT_TYPES, DATA_INPUT_TYPES } from "../../workflow/input-parameter.js";
import type { TestFormatDiagnostic } from "../validate.js";
import type { WorkflowInput } from "./types.js";
import { asRecord } from "./coerce.js";

export const MAP_OVER_KEYWORD = "workflow_input_collection_map_over";

export interface InputMetadataOptions {
  /** Galaxy's datatype hierarchy; without it, filetypes aren't checked. */
  datatypes?: DatatypesMapperModel;
}

export function extractInputMetadata(
  raw: Record<string, unknown>,
  type: WorkflowInput["type"],
): Pick<WorkflowInput, "collectionType" | "formats" | "multiple"> {
  if (Array.isArray(raw.type) || raw.multiple === true) return { multiple: true };
  if (COLLECTION_INPUT_TYPES.has(type)) {
    const collectionType = raw.collection_type;
    if (collectionType === undefined) return { collectionType: "list" };
    return typeof collectionType === "string" && collectionType ? { collectionType } : {};
  }
  if (!DATA_INPUT_TYPES.has(type)) return {};
  const format = raw.format;
  const entries = typeof format === "string" ? format.split(",") : format;
  if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === "string")) {
    return {};
  }
  const formats = entries.map((entry: string) => entry.trim()).filter(Boolean);
  return formats.length > 0 ? { formats } : {};
}

/**
 * True when a job binding differs from the input shape the workflow declares,
 * so Galaxy maps the workflow over it. Output shapes resolved from the
 * workflow assume the declared inputs, so they don't hold for such a test.
 */
export function mapsOverDeclaredInput(declared: WorkflowInput, value: unknown): boolean {
  const entry = asRecord(value);
  if (declared.multiple || entry?.class !== "Collection") return false;
  if (DATA_INPUT_TYPES.has(declared.type)) return true;
  if (!COLLECTION_INPUT_TYPES.has(declared.type) || declared.collectionType === undefined) {
    return false;
  }
  return entry.collection_type !== declared.collectionType;
}

export function checkInputMetadata(
  declared: WorkflowInput,
  value: unknown,
  path: string,
  options: InputMetadataOptions = {},
): TestFormatDiagnostic[] {
  if (declared.multiple) return [];
  const entry = asRecord(value);
  const actualClass = entry?.class;
  const expectedClass = COLLECTION_INPUT_TYPES.has(declared.type)
    ? "Collection"
    : DATA_INPUT_TYPES.has(declared.type)
      ? "File"
      : undefined;
  if (!expectedClass || (actualClass !== "File" && actualClass !== "Collection")) return [];
  const actualCollection =
    typeof entry?.collection_type === "string" ? entry.collection_type : undefined;
  if (actualClass === "Collection" && expectedClass === "File") {
    const described = actualCollection ? ` '${actualCollection}'` : "";
    return [
      {
        path: `${path}/class`,
        message: `Input '${declared.name}' is a dataset input; a${described} collection maps the workflow over it.`,
        keyword: MAP_OVER_KEYWORD,
        params: { input: declared.name, expectedClass, actualClass, actualCollection },
        severity: "warning",
      },
    ];
  }
  if (actualClass !== expectedClass) {
    return [
      {
        path: `${path}/class`,
        message: `Input '${declared.name}' expects '${expectedClass}' but the test declares '${actualClass}'.`,
        keyword: "workflow_input_kind",
        params: { input: declared.name, expectedClass, actualClass },
      },
    ];
  }

  if (actualClass === "Collection") {
    const diagnostic = checkCollectionType(declared, actualCollection, path);
    return diagnostic ? [diagnostic] : [];
  }

  const diagnostic = checkFiletype(declared, entry?.filetype, path, options.datatypes);
  return diagnostic ? [diagnostic] : [];
}

/**
 * A filetype outside the input's declared formats is a warning: Galaxy may
 * still run the test (an implicit conversion, or a format list narrower than
 * the tool's). A filetype Galaxy doesn't know is a warning too, since the
 * upload would fail. Formats the registry doesn't know aren't judged.
 */
function checkFiletype(
  declared: WorkflowInput,
  filetype: unknown,
  path: string,
  datatypes: DatatypesMapperModel | undefined,
): TestFormatDiagnostic | undefined {
  const expectedFormats = declared.formats;
  if (!datatypes || !expectedFormats || typeof filetype !== "string" || filetype === "auto") {
    return undefined;
  }
  if (expectedFormats.includes(filetype)) return undefined;
  const mapping = datatypes.datatypesMapping;
  const known = (type: string) =>
    Object.hasOwn(mapping.ext_to_class_name, type) || Object.hasOwn(mapping.class_to_classes, type);
  const diagnostic = (message: string, knownFiletype: boolean): TestFormatDiagnostic => ({
    path: `${path}/filetype`,
    message,
    keyword: "workflow_input_format",
    params: { input: declared.name, expectedFormats, actualFormat: filetype, known: knownFiletype },
    severity: "warning",
  });
  if (!Object.hasOwn(mapping.ext_to_class_name, filetype)) {
    return diagnostic(
      `Input '${declared.name}' has filetype '${filetype}', which is not a known Galaxy datatype.`,
      false,
    );
  }
  if (!expectedFormats.every(known)) return undefined;
  if (producesAcceptableDatatype(datatypes, [...expectedFormats], [filetype]).canAccept) {
    return undefined;
  }
  return diagnostic(
    `Input '${declared.name}' expects format '${expectedFormats.join(", ")}' but the test declares '${filetype}'.`,
    true,
  );
}

/**
 * A collection the input accepts passes. One that maps over the input is a
 * warning: Galaxy runs the workflow once per subcollection. Anything else is
 * an error.
 */
function checkCollectionType(
  declared: WorkflowInput,
  actualCollection: string | undefined,
  path: string,
): TestFormatDiagnostic | undefined {
  const expectedCollection = declared.collectionType;
  if (expectedCollection === undefined || actualCollection === undefined) return undefined;
  const choices = expectedCollection.split(",").map((choice) => choice.trim());
  if (choices.includes(actualCollection)) return undefined;
  if (!isValidCollectionTypeStr(actualCollection) || !choices.every(isValidCollectionTypeStr)) {
    return undefined;
  }
  const actual = new CollectionTypeDescription(actualCollection);
  const accepted = choices.map((choice) => new CollectionTypeDescription(choice));
  if (accepted.some((choice) => choice.accepts(actual))) return undefined;
  const params = { input: declared.name, expectedCollection, actualCollection };
  if (accepted.some((choice) => actual.canMapOver(choice))) {
    return {
      path: `${path}/collection_type`,
      message: `Input '${declared.name}' expects collection type '${expectedCollection}'; a '${actualCollection}' collection maps the workflow over it.`,
      keyword: MAP_OVER_KEYWORD,
      params,
      severity: "warning",
    };
  }
  return {
    path: `${path}/collection_type`,
    message: `Input '${declared.name}' expects collection type '${expectedCollection}' but the test declares '${actualCollection}'.`,
    keyword: "workflow_input_collection_type",
    params,
  };
}
