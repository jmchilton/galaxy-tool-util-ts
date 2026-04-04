/**
 * Shared workflow file I/O helpers for CLI commands.
 */
import { detectFormat, type WorkflowFormat } from "@galaxy-tool-util/schema";
import { readFile, writeFile } from "node:fs/promises";
import * as YAML from "yaml";

/** Read and parse a workflow file, auto-detecting JSON vs YAML by extension. */
export async function readWorkflowFile(filePath: string): Promise<Record<string, unknown> | null> {
  const raw = await readFile(filePath, "utf-8");
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

/** Resolve workflow format from user option or auto-detect. */
export function resolveFormat(data: Record<string, unknown>, formatOpt?: string): WorkflowFormat {
  if (formatOpt === "native" || formatOpt === "format2") return formatOpt;
  return detectFormat(data);
}

/** Serialize a workflow to JSON or YAML string based on format. */
export function serializeWorkflow(
  data: Record<string, unknown>,
  format: WorkflowFormat,
  opts?: { json?: boolean; yaml?: boolean },
): string {
  const useYaml = opts?.yaml || (!opts?.json && format === "format2");
  if (useYaml) {
    return YAML.stringify(data, { lineWidth: 0 });
  }
  return JSON.stringify(data, null, 2) + "\n";
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
