/**
 * GA4GH TRS (Tool Registry Service) v2 schemas.
 *
 * Hand-port of the subset of the TRS OpenAPI consumed by Galaxy's tool
 * shed surface — see `lib/tool_shed_client/schema/trs.py` upstream. Only
 * the types referenced from `Tool`/`ToolVersion` are included.
 */

import * as S from "effect/Schema";

export const ImageType = S.Literal("Docker", "Singularity", "Conda");
export type ImageType = S.Schema.Type<typeof ImageType>;

export const DescriptorType = S.Literal("CWL", "WDL", "NFL", "GALAXY", "SMK");
export type DescriptorType = S.Schema.Type<typeof DescriptorType>;

export const FileType = S.Literal(
  "TEST_FILE",
  "PRIMARY_DESCRIPTOR",
  "SECONDARY_DESCRIPTOR",
  "CONTAINERFILE",
  "OTHER",
);
export type FileType = S.Schema.Type<typeof FileType>;

export const Checksum = S.Struct({
  checksum: S.String,
  type: S.String,
});
export type Checksum = S.Schema.Type<typeof Checksum>;

export const ImageData = S.Struct({
  registry_host: S.optional(S.String),
  image_name: S.optional(S.String),
  size: S.optional(S.Number),
  updated: S.optional(S.String),
  checksum: S.optional(S.Array(Checksum)),
  image_type: S.optional(ImageType),
});
export type ImageData = S.Schema.Type<typeof ImageData>;

export const ToolClass = S.Struct({
  id: S.optional(S.String),
  name: S.optional(S.String),
  description: S.optional(S.String),
});
export type ToolClass = S.Schema.Type<typeof ToolClass>;

export const ToolVersion = S.Struct({
  url: S.String,
  id: S.String,
  author: S.optional(S.Array(S.String)),
  name: S.optional(S.String),
  is_production: S.optional(S.Boolean),
  images: S.optional(S.Array(ImageData)),
  descriptor_type: S.optional(S.Array(DescriptorType)),
  descriptor_type_version: S.optional(S.Record({ key: S.String, value: S.Array(S.String) })),
  containerfile: S.optional(S.Boolean),
  meta_version: S.optional(S.String),
  verified: S.optional(S.Boolean),
  verified_source: S.optional(S.Array(S.String)),
  signed: S.optional(S.Boolean),
  included_apps: S.optional(S.Array(S.String)),
});
export type ToolVersion = S.Schema.Type<typeof ToolVersion>;

export const Tool = S.Struct({
  url: S.String,
  id: S.String,
  organization: S.String,
  toolclass: ToolClass,
  versions: S.Array(ToolVersion),
  aliases: S.optional(S.Array(S.String)),
  name: S.optional(S.String),
  description: S.optional(S.String),
  meta_version: S.optional(S.String),
  has_checker: S.optional(S.Boolean),
  checker_url: S.optional(S.String),
});
export type Tool = S.Schema.Type<typeof Tool>;

/** Galaxy's default tool class — single hardcoded value. */
export const GALAXY_TOOL_CLASS: ToolClass = {
  id: "GalaxyTool",
  name: "Galaxy Tool",
  description: "Galaxy XML/YAML tool definition.",
};
