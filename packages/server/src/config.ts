import * as S from "effect/Schema";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

export const ToolSource = S.Struct({
  type: S.Union(S.Literal("toolshed"), S.Literal("galaxy")),
  url: S.String,
  enabled: S.optionalWith(S.Boolean, { default: () => true }),
});
export type ToolSource = S.Schema.Type<typeof ToolSource>;

export const CacheConfig = S.Struct({
  directory: S.optional(S.String),
});

export const ServerConfig = S.Struct({
  "galaxy.workflows.toolSources": S.optionalWith(S.Array(ToolSource), {
    default: () => [],
  }),
  "galaxy.workflows.toolCache": S.optionalWith(CacheConfig, {
    default: () => ({}) as S.Schema.Type<typeof CacheConfig>,
  }),
  port: S.optionalWith(S.Number, { default: () => 8080 }),
  host: S.optionalWith(S.String, { default: () => "127.0.0.1" }),
});
export type ServerConfig = S.Schema.Type<typeof ServerConfig>;

export async function loadConfig(configPath: string): Promise<ServerConfig> {
  const raw = await readFile(configPath, "utf-8");
  const parsed = YAML.parse(raw);
  return S.decodeUnknownSync(ServerConfig)(parsed);
}

export function defaultConfig(): ServerConfig {
  return S.decodeUnknownSync(ServerConfig)({});
}
