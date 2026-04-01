import * as S from "effect/Schema";

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

/** Normalize empty string to null for description field. */
const NullableDescription = S.transform(S.NullOr(S.String), S.NullOr(S.String), {
  decode: (val) => (val === "" ? null : val),
  encode: (val) => val,
});

/**
 * Effect Schema for parsed Galaxy tool metadata as returned by the ToolShed TRS API
 * or Galaxy's /api/tools/:id/parsed endpoint.
 */
export const ParsedTool = S.Struct({
  id: S.String,
  version: S.NullOr(S.String),
  name: S.String,
  description: NullableDescription,
  inputs: S.Array(S.Unknown),
  outputs: S.Array(S.Unknown),
  citations: S.Array(Citation),
  license: S.NullOr(S.String),
  profile: S.NullOr(S.String),
  edam_operations: S.Array(S.String),
  edam_topics: S.Array(S.String),
  xrefs: S.Array(XrefDict),
  help: S.optional(S.Union(HelpContent, S.Null)),
});

export type ParsedTool = S.Schema.Type<typeof ParsedTool>;
