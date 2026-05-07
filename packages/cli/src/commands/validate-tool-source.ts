/**
 * ``gxwf validate-tool-source`` — validate a user-defined Galaxy tool source
 * YAML file (``class: GalaxyUserTool`` / ``class: GalaxyTool``) against the
 * JSON Schema synced from Galaxy's ``galaxy.tool_util_models.DynamicToolSources``
 * Pydantic models, plus the semantic checks added in
 * galaxyproject/galaxy#22615 (input refs, output discovery, citation shape,
 * blank required fields).
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { validateUserToolSource, type UserToolSourceDiagnostic } from "@galaxy-tool-util/schema";

export interface ValidateToolSourceOptions {
  json?: boolean;
  schemaOnly?: boolean;
}

export interface ValidateToolSourceReport {
  file: string;
  valid: boolean;
  errors: UserToolSourceDiagnostic[];
}

export async function runValidateToolSource(
  filePath: string,
  opts: ValidateToolSourceOptions = {},
): Promise<void> {
  const raw = await readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      const report: ValidateToolSourceReport = {
        file: filePath,
        valid: false,
        errors: [
          { path: "(root)", message: `YAML parse error: ${msg}`, keyword: "yaml", params: {} },
        ],
      };
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error(`${filePath}: YAML parse error: ${msg}`);
    }
    process.exitCode = 2;
    return;
  }

  const { valid, errors } = validateUserToolSource(parsed, { schemaOnly: opts.schemaOnly });

  if (opts.json) {
    const report: ValidateToolSourceReport = { file: filePath, valid, errors };
    console.log(JSON.stringify(report, null, 2));
  } else if (valid) {
    console.log(`${filePath}: OK`);
  } else {
    console.error(`${filePath}: ${errors.length} validation error(s)`);
    for (const e of errors) {
      console.error(`  ${e.path}: ${e.message} [${e.keyword}]`);
    }
  }

  process.exitCode = valid ? 0 : 1;
}
