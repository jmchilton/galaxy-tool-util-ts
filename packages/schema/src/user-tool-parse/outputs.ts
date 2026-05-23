/**
 * Inline tool output parser. Mirrors
 * `galaxy.tool_util.parser.yaml.YamlToolSource.parse_outputs` +
 * `output_objects.ToolOutput.from_dict` and `output_objects.ToolOutputCollection`.
 * Produces the `ToolOutput` union from `../schema/parsed-tool.ts` (data /
 * collection / text / integer / float / boolean).
 */

import type {
  DatasetCollectionDescription,
  FilePatternDatasetCollectionDescription,
  ToolOutput,
  ToolOutputCollection,
  ToolOutputCollectionStructure,
  ToolOutputDataset,
  ToolProvidedMetadataDatasetCollection,
  SortKey,
  SortComp,
} from "../schema/parsed-tool.js";

type Dict = Record<string, unknown>;

const DEFAULT_EXTRA_FILENAME_PATTERN = String.raw`primary_DATASET_ID_(?P<designation>[^_]+)_(?P<visible>[^_]+)_(?P<ext>[^_]+)(_(?P<dbkey>[^_]+))?`;

const NAMED_PATTERNS: Record<string, string> = {
  __default__: DEFAULT_EXTRA_FILENAME_PATTERN,
  __name__: String.raw`(?P<name>.*)`,
  __designation__: String.raw`(?P<designation>.*)`,
  __name_and_ext__: String.raw`(?P<name>.*)\.(?P<ext>[^\.]+)?`,
  __designation_and_ext__: String.raw`(?P<designation>.*)\.(?P<ext>[^\._]+)?`,
};

const DEFAULT_SORT_BY = "filename";
const DEFAULT_SORT_COMP = "lexical";

const VALID_SORT_KEYS: ReadonlySet<SortKey> = new Set<SortKey>([
  "filename",
  "name",
  "designation",
  "dbkey",
]);

export function parseOutputs(raw: unknown): ToolOutput[] {
  const list = normalizeOutputList(raw);
  return list.map(parseOutput);
}

function normalizeOutputList(raw: unknown): Dict[] {
  if (Array.isArray(raw)) {
    return raw.filter(isDict);
  }
  if (raw && typeof raw === "object") {
    const out: Dict[] = [];
    for (const [k, v] of Object.entries(raw as Dict)) {
      if (isDict(v)) {
        const merged = { ...(v as Dict) };
        if (merged.name == null) merged.name = k;
        out.push(merged);
      }
    }
    return out;
  }
  return [];
}

function parseOutput(entry: Dict): ToolOutput {
  const type = typeof entry.type === "string" ? entry.type : "data";
  if (type === "collection") return parseOutputCollection(entry);
  if (type === "data") return parseOutputData(entry);
  if (type === "integer") return baseScalar(entry, "integer");
  if (type === "float") return baseScalar(entry, "float");
  if (type === "boolean") return baseScalar(entry, "boolean");
  if (type === "text") return baseScalar(entry, "text");
  throw new Error(`Unknown output_type '${type}'`);
}

function parseOutputData(entry: Dict): ToolOutputDataset {
  return {
    name: readString(entry.name),
    label: readNullableString(entry.label),
    hidden: readBool(entry.hidden, false),
    type: "data",
    format: readString(entry.format) || "data",
    format_source: readNullableString(entry.format_source),
    metadata_source: readNullableString(entry.metadata_source),
    discover_datasets: parseDiscoverDatasets(entry.discover_datasets),
    from_work_dir: readNullableString(entry.from_work_dir),
    precreate_directory: readBool(entry.precreate_directory, false),
  };
}

function baseScalar(entry: Dict, type: "text" | "integer" | "float" | "boolean"): ToolOutput {
  return {
    name: readString(entry.name),
    label: readNullableString(entry.label),
    hidden: readBool(entry.hidden, false),
    type,
  } as ToolOutput;
}

function parseOutputCollection(entry: Dict): ToolOutputCollection {
  return {
    name: readString(entry.name),
    label: readNullableString(entry.label),
    hidden: readBool(entry.hidden, false),
    type: "collection",
    structure: parseStructure(entry),
  };
}

function parseStructure(entry: Dict): ToolOutputCollectionStructure {
  // YAML lets you put `collection_type`, `type_source`, `structured_like`
  // either at the output root or under `structure: {...}`. Prefer explicit
  // `structure` if present (mirrors `ToolOutputCollectionStructure.from_dict`),
  // otherwise read from the entry itself.
  const sourceDict = isDict(entry.structure) ? (entry.structure as Dict) : entry;
  const collectionType = readNullableString(sourceDict.collection_type);
  const collectionTypeSource = readNullableString(
    sourceDict.collection_type_source ?? sourceDict.type_source,
  );
  const collectionTypeFromRules = readNullableString(sourceDict.collection_type_from_rules);
  const structuredLike = readNullableString(sourceDict.structured_like);
  const discoverDatasets = parseDiscoverDatasets(sourceDict.discover_datasets);
  return {
    collection_type: collectionType,
    collection_type_source: collectionTypeSource,
    collection_type_from_rules: collectionTypeFromRules,
    structured_like: structuredLike,
    discover_datasets: discoverDatasets,
  };
}

function parseDiscoverDatasets(raw: unknown): DatasetCollectionDescription[] | null {
  let list: unknown[];
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) list = raw;
  else if (isDict(raw)) list = [raw];
  else return null;
  const out = list.filter(isDict).map(parseDiscoverDataset);
  // Mirrors `_validate_collectors`: more than one collector forbids
  // `tool_provided_metadata`.
  if (out.length > 1 && out.some((d) => d.discover_via === "tool_provided_metadata")) {
    throw new Error(
      "Cannot specify more than one discover dataset condition if any of them specify tool_provided_metadata.",
    );
  }
  return out;
}

function parseDiscoverDataset(entry: Dict): DatasetCollectionDescription {
  const fromProvidedMetadata = readBool(entry.from_provided_metadata, false);
  const discoverVia =
    typeof entry.discover_via === "string"
      ? entry.discover_via
      : fromProvidedMetadata
        ? "tool_provided_metadata"
        : "pattern";

  const base = {
    format: readNullableString(entry.format ?? entry.ext),
    visible: readBool(entry.visible, false),
    assign_primary_output: readBool(entry.assign_primary_output, false),
    directory: readNullableString(entry.directory),
    recurse: readBool(entry.recurse, false),
    match_relative_path: readBool(entry.match_relative_path, false),
  };

  if (discoverVia === "tool_provided_metadata") {
    if (entry.pattern || entry.sort_by) {
      throw new Error(
        "Cannot specify attribute [pattern] or [sort_by] if from_provided_metadata is True",
      );
    }
    const desc: ToolProvidedMetadataDatasetCollection = {
      discover_via: "tool_provided_metadata",
      ...base,
    };
    return desc;
  }

  const pattern = resolvePattern(entry);
  const [sortKey, sortComp, sortReverse] = resolveSortFields(entry);
  const desc: FilePatternDatasetCollectionDescription = {
    discover_via: "pattern",
    ...base,
    pattern,
    sort_key: sortKey,
    sort_comp: sortComp,
    sort_reverse: sortReverse,
  };
  return desc;
}

function resolvePattern(entry: Dict): string {
  const raw = entry.pattern;
  const pattern = typeof raw === "string" && raw ? raw : "__default__";
  return NAMED_PATTERNS[pattern] ?? pattern;
}

function resolveSortFields(entry: Dict): [SortKey, SortComp, boolean] {
  if (
    entry.sort_by == null &&
    typeof entry.sort_key === "string" &&
    typeof entry.sort_comp === "string" &&
    entry.sort_reverse !== undefined
  ) {
    return [
      validateSortKey(entry.sort_key),
      entry.sort_comp === "numeric" ? "numeric" : "lexical",
      readBool(entry.sort_reverse, false),
    ];
  }
  let sortBy = typeof entry.sort_by === "string" ? entry.sort_by : DEFAULT_SORT_BY;
  let sortReverse = false;
  if (sortBy.startsWith("reverse_")) {
    sortReverse = true;
    sortBy = sortBy.slice("reverse_".length);
  }
  let sortComp: SortComp = DEFAULT_SORT_COMP;
  if (sortBy.includes("_")) {
    const idx = sortBy.indexOf("_");
    const compPart = sortBy.slice(0, idx);
    if (compPart === "lexical" || compPart === "numeric") {
      sortComp = compPart;
      sortBy = sortBy.slice(idx + 1);
    }
  }
  return [validateSortKey(sortBy), sortComp, sortReverse];
}

function validateSortKey(value: string): SortKey {
  if (VALID_SORT_KEYS.has(value as SortKey)) {
    return value as SortKey;
  }
  throw new Error(`Invalid sort key '${value}'`);
}

function isDict(v: unknown): v is Dict {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function readString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function readNullableString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

function readBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return true;
    if (lower === "false" || lower === "no" || lower === "0") return false;
  }
  return fallback;
}
