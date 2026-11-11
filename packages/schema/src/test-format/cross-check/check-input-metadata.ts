import type { TestFormatDiagnostic } from "../validate.js";
import type { WorkflowInput } from "./types.js";

export interface InputMetadataOptions {
  collectionTypeAccepts?: (expected: string, actual: string) => boolean | undefined;
  inputFormatAccepts?: (expected: readonly string[], actual: string) => boolean | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function extractInputMetadata(
  raw: Record<string, unknown>,
  type: WorkflowInput["type"],
): Pick<WorkflowInput, "collectionType" | "formats" | "multiple"> {
  if (Array.isArray(raw.type) || raw.multiple === true) return { multiple: true };
  if (type === "collection") {
    const collectionType = raw.collection_type;
    if (collectionType === undefined) return { collectionType: "list" };
    return typeof collectionType === "string" && collectionType ? { collectionType } : {};
  }
  if (type !== "data" && type !== "File") return {};
  const format = raw.format;
  const entries = typeof format === "string" ? format.split(",") : format;
  if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === "string")) {
    return {};
  }
  const formats = entries.map((entry: string) => entry.trim()).filter(Boolean);
  return formats.length > 0 ? { formats } : {};
}

function concreteCollectionTypeAccepts(expected: string, actual: string): boolean | undefined {
  const choices = expected.split(",").map((entry) => entry.trim());
  if (choices.includes(actual)) return true;
  // Without Galaxy's rules, compare only unambiguous collection types.
  const concrete = /^(?:list|paired|record)(?::(?:list|paired|record))*$/;
  return concrete.test(actual) && choices.every((choice) => concrete.test(choice))
    ? false
    : undefined;
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
  const expectedClass =
    declared.type === "collection"
      ? "Collection"
      : declared.type === "data" || declared.type === "File"
        ? "File"
        : undefined;
  if (!expectedClass || (actualClass !== "File" && actualClass !== "Collection")) return [];
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

  const expectedCollection = declared.collectionType;
  const actualCollection = entry?.collection_type;
  if (
    actualClass === "Collection" &&
    expectedCollection !== undefined &&
    typeof actualCollection === "string" &&
    (options.collectionTypeAccepts ?? concreteCollectionTypeAccepts)(
      expectedCollection,
      actualCollection,
    ) === false
  ) {
    return [
      {
        path: `${path}/collection_type`,
        message: `Input '${declared.name}' expects collection type '${expectedCollection}' but the test declares '${actualCollection}'.`,
        keyword: "workflow_input_collection_type",
        params: { input: declared.name, expectedCollection, actualCollection },
      },
    ];
  }

  const expectedFormats = declared.formats;
  const actualFormat = entry?.filetype;
  // The format hierarchy comes from Galaxy's datatype registry. Without it, a
  // string mismatch doesn't prove incompatibility (txt and tabular, for example).
  if (
    actualClass === "File" &&
    expectedFormats !== undefined &&
    typeof actualFormat === "string" &&
    !expectedFormats.includes(actualFormat) &&
    options.inputFormatAccepts?.(expectedFormats, actualFormat) === false
  ) {
    return [
      {
        path: `${path}/filetype`,
        message: `Input '${declared.name}' expects format '${expectedFormats.join(", ")}' but the test declares '${actualFormat}'.`,
        keyword: "workflow_input_format",
        params: { input: declared.name, expectedFormats, actualFormat },
      },
    ];
  }
  return [];
}
