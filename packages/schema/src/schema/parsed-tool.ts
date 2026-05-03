import * as S from "effect/Schema";
import * as JSONSchema from "effect/JSONSchema";

import type { ToolParameterModel } from "./bundle-types.js";

/** Tool help content with format (rst, markdown, etc.) and rendered content. */
export const HelpContent = S.Struct({
  format: S.String,
  content: S.String,
});

/** External reference (e.g. bio.tools ID, bioconductor package). */
export const XrefDict = S.Struct({
  value: S.String,
  type: S.String,
});

/** Tool citation entry (bibtex, doi, etc.). */
export const Citation = S.Struct({
  type: S.String,
  content: S.String,
});

export const DiscoverVia = S.Literal("pattern", "tool_provided_metadata");
export const SortKey = S.Literal("filename", "name", "designation", "dbkey");
export const SortComp = S.Literal("lexical", "numeric");

const DatasetCollectionDescriptionBase = S.Struct({
  discover_via: DiscoverVia,
  format: S.NullOr(S.String),
  visible: S.Boolean,
  assign_primary_output: S.Boolean,
  directory: S.NullOr(S.String),
  recurse: S.Boolean,
  match_relative_path: S.Boolean,
});

export const ToolProvidedMetadataDatasetCollection = S.Struct({
  ...DatasetCollectionDescriptionBase.fields,
  discover_via: S.Literal("tool_provided_metadata"),
});

export const FilePatternDatasetCollectionDescription = S.Struct({
  ...DatasetCollectionDescriptionBase.fields,
  discover_via: S.Literal("pattern"),
  sort_key: SortKey,
  sort_comp: SortComp,
  sort_reverse: S.Boolean,
  pattern: S.String,
});

export const DatasetCollectionDescription = S.Union(
  FilePatternDatasetCollectionDescription,
  ToolProvidedMetadataDatasetCollection,
);

const ToolOutputBase = S.Struct({
  name: S.String,
  label: S.NullOr(S.String),
  hidden: S.Boolean,
});

export const ToolOutputDataset = S.Struct({
  ...ToolOutputBase.fields,
  type: S.Literal("data"),
  format: S.String,
  format_source: S.NullOr(S.String),
  metadata_source: S.NullOr(S.String),
  discover_datasets: S.NullOr(S.Array(DatasetCollectionDescription)),
  from_work_dir: S.NullOr(S.String),
  precreate_directory: S.Boolean,
});

export const ToolOutputCollectionStructure = S.Struct({
  collection_type: S.NullOr(S.String),
  collection_type_source: S.NullOr(S.String),
  collection_type_from_rules: S.NullOr(S.String),
  structured_like: S.NullOr(S.String),
  discover_datasets: S.NullOr(S.Array(DatasetCollectionDescription)),
});

export const ToolOutputCollection = S.Struct({
  ...ToolOutputBase.fields,
  type: S.Literal("collection"),
  structure: ToolOutputCollectionStructure,
});

export const ToolOutputText = S.Struct({
  ...ToolOutputBase.fields,
  type: S.Literal("text"),
});

export const ToolOutputInteger = S.Struct({
  ...ToolOutputBase.fields,
  type: S.Literal("integer"),
});

export const ToolOutputFloat = S.Struct({
  ...ToolOutputBase.fields,
  type: S.Literal("float"),
});

export const ToolOutputBoolean = S.Struct({
  ...ToolOutputBase.fields,
  type: S.Literal("boolean"),
});

export const ToolOutput = S.Union(
  ToolOutputDataset,
  ToolOutputCollection,
  ToolOutputText,
  ToolOutputInteger,
  ToolOutputFloat,
  ToolOutputBoolean,
);

/** Normalize empty string to null for description field. */
const NullableDescription = S.transform(S.NullOr(S.String), S.NullOr(S.String), {
  decode: (val) => (val === "" ? null : val),
  encode: (val) => val,
});

/**
 * Trusted-peer schema for a single tool input parameter. Effect Schema does
 * not describe the full `ToolParameterModel` discriminated union (that lives
 * as plain TS interfaces in `bundle-types.ts`), so we use a permissive
 * object-shaped guard here and supply the TS type via the generic parameter.
 * `ParsedTool` payloads come from Python's `model_dump()` — already trusted.
 */
const ToolParameterModelSchema: S.Schema<ToolParameterModel> = S.declare(
  (input: unknown): input is ToolParameterModel =>
    typeof input === "object" && input !== null && !Array.isArray(input),
).annotations({ jsonSchema: { type: "object" } });

/**
 * Effect Schema for parsed Galaxy tool metadata as returned by the ToolShed TRS API
 * or Galaxy's /api/tools/:id/parsed endpoint.
 */
export const ParsedTool = S.Struct({
  id: S.String,
  version: S.NullOr(S.String),
  name: S.String,
  description: NullableDescription,
  inputs: S.Array(ToolParameterModelSchema),
  outputs: S.Array(ToolOutput),
  citations: S.Array(Citation),
  license: S.NullOr(S.String),
  profile: S.NullOr(S.String),
  edam_operations: S.Array(S.String),
  edam_topics: S.Array(S.String),
  xrefs: S.Array(XrefDict),
  help: S.optional(S.Union(HelpContent, S.Null)),
});

export const parsedToolSchema = JSONSchema.make(ParsedTool, { target: "jsonSchema2020-12" });

export type DiscoverVia = S.Schema.Type<typeof DiscoverVia>;
export type SortKey = S.Schema.Type<typeof SortKey>;
export type SortComp = S.Schema.Type<typeof SortComp>;
export type ToolProvidedMetadataDatasetCollection = S.Schema.Type<
  typeof ToolProvidedMetadataDatasetCollection
>;
export type FilePatternDatasetCollectionDescription = S.Schema.Type<
  typeof FilePatternDatasetCollectionDescription
>;
export type DatasetCollectionDescription = S.Schema.Type<typeof DatasetCollectionDescription>;
export type ToolOutputDataset = S.Schema.Type<typeof ToolOutputDataset>;
export type ToolOutputCollectionStructure = S.Schema.Type<typeof ToolOutputCollectionStructure>;
export type ToolOutputCollection = S.Schema.Type<typeof ToolOutputCollection>;
export type ToolOutputText = S.Schema.Type<typeof ToolOutputText>;
export type ToolOutputInteger = S.Schema.Type<typeof ToolOutputInteger>;
export type ToolOutputFloat = S.Schema.Type<typeof ToolOutputFloat>;
export type ToolOutputBoolean = S.Schema.Type<typeof ToolOutputBoolean>;
export type ToolOutput = S.Schema.Type<typeof ToolOutput>;
export type ParsedTool = S.Schema.Type<typeof ParsedTool>;
