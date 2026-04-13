import { readFile } from "node:fs/promises";
import * as S from "effect/Schema";
import YAML from "yaml";

import { WorkflowToolConfig } from "./config.js";

/**
 * Load the shared tool configuration portion from a YAML file.
 * Unknown fields (e.g. `port`, `host`) are silently ignored.
 */
export async function loadWorkflowToolConfig(configPath: string): Promise<WorkflowToolConfig> {
  const raw = await readFile(configPath, "utf-8");
  const parsed = YAML.parse(raw) as unknown;
  return S.decodeUnknownSync(WorkflowToolConfig)(parsed);
}
