import * as S from "effect/Schema";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { WorkflowToolConfig } from "@galaxy-tool-util/core";

export { WorkflowToolConfig };
export type { ToolSourceConfig, ToolCacheConfig } from "@galaxy-tool-util/core";

/** Effect Schema for the proxy server YAML configuration file. */
export const ServerConfig = S.Struct({
  ...WorkflowToolConfig.fields,
  port: S.optionalWith(S.Number, { default: () => 8080 }),
  host: S.optionalWith(S.String, { default: () => "127.0.0.1" }),
});
export type ServerConfig = S.Schema.Type<typeof ServerConfig>;

/** Load and validate a YAML config file against the {@link ServerConfig} schema. */
export async function loadConfig(configPath: string): Promise<ServerConfig> {
  const raw = await readFile(configPath, "utf-8");
  const parsed = YAML.parse(raw) as unknown;
  return S.decodeUnknownSync(ServerConfig)(parsed);
}

/** Create a default server config (empty sources, port 8080, localhost). */
export function defaultConfig(): ServerConfig {
  return S.decodeUnknownSync(ServerConfig)({});
}
