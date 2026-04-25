import { DEFAULT_TOOLSHED_URL } from "@galaxy-tool-util/core";
import { ToolFetchError, getTRSToolVersions } from "@galaxy-tool-util/search";

export interface ToolVersionsOptions {
  json?: boolean;
  latest?: boolean;
}

export interface ToolVersionsJsonOutput {
  trsToolId: string;
  versions: string[];
}

export function toTrsToolId(input: string): string {
  if (input.includes("~")) return input;
  const parts = input.split("/").filter((p) => p.length > 0);
  if (parts.length === 3) return `${parts[0]}~${parts[1]}~${parts[2]}`;
  throw new Error(
    `Invalid tool id: expected \`<owner>~<repo>~<tool_id>\` or \`<owner>/<repo>/<tool_id>\`, got: ${input}`,
  );
}

export async function runToolVersions(toolId: string, opts: ToolVersionsOptions): Promise<void> {
  let trsToolId: string;
  try {
    trsToolId = toTrsToolId(toolId);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  let rawVersions;
  try {
    rawVersions = await getTRSToolVersions(DEFAULT_TOOLSHED_URL, trsToolId);
  } catch (err) {
    if (err instanceof ToolFetchError) {
      console.error(`TRS request failed: ${err.message}`);
      process.exitCode = 3;
      return;
    }
    throw err;
  }

  // Tool Shed returns oldest-first; we emit newest-last (pass-through).
  const versions = rawVersions.map((v) => v.id);

  if (opts.latest) {
    const latest = versions[versions.length - 1];
    if (latest === undefined) {
      if (opts.json) {
        console.log(JSON.stringify({ trsToolId, versions: [] }, null, 2));
      } else {
        console.error(`No versions published for ${trsToolId}`);
      }
      process.exitCode = 2;
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify({ trsToolId, versions: [latest] }, null, 2));
    } else {
      console.log(latest);
    }
    return;
  }

  if (opts.json) {
    const envelope: ToolVersionsJsonOutput = { trsToolId, versions };
    console.log(JSON.stringify(envelope, null, 2));
  } else if (versions.length === 0) {
    console.error(`No versions published for ${trsToolId}`);
  } else {
    for (const v of versions) console.log(v);
  }

  if (versions.length === 0) {
    process.exitCode = 2;
  }
}
