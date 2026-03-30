import * as S from "@effect/schema/Schema";

export const HelpContent = S.Struct({
  format: S.String,
  content: S.String,
});

export const XrefDict = S.Struct({
  value: S.String,
  type: S.String,
});

export const Citation = S.Struct({
  type: S.String,
  content: S.String,
});

/** Normalize empty string to null for description field. */
const NullableDescription = S.transform(S.NullOr(S.String), S.NullOr(S.String), {
  decode: (val) => (val === "" ? null : val),
  encode: (val) => val,
});

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
