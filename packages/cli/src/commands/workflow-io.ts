/**
 * Workflow file I/O helpers for CLI commands.
 *
 * `resolveFormat` and `serializeWorkflow` are now provided by
 * `@galaxy-tool-util/schema` so the web server can share them; this file
 * re-exports them for callers that used the older cli-local paths and keeps
 * the fs-based read/write helpers here (Node-only).
 */
import { readFile, writeFile } from "node:fs/promises";
import * as YAML from "yaml";

export { resolveFormat, serializeWorkflow } from "@galaxy-tool-util/schema";
export type { SerializeWorkflowOptions } from "@galaxy-tool-util/schema";

/** Read and parse a workflow file, auto-detecting JSON vs YAML by extension; `null` on failure. */
export async function readWorkflowFile(filePath: string): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to read ${filePath}: ${msg}`);
    process.exitCode = 1;
    return null;
  }
  try {
    if (filePath.endsWith(".ga") || filePath.endsWith(".json")) {
      return JSON.parse(raw);
    }
    return YAML.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to parse ${filePath}: ${msg}`);
    process.exitCode = 1;
    return null;
  }
}

/** Write serialized workflow content to a file or stdout. */
export async function writeWorkflowOutput(
  content: string,
  output?: string,
  label = "Workflow",
): Promise<void> {
  if (output) {
    await writeFile(output, content, "utf-8");
    console.log(`${label} written to ${output}`);
  } else {
    process.stdout.write(content);
  }
}
