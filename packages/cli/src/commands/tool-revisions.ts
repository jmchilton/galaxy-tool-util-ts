import { DEFAULT_TOOLSHED_URL } from "@galaxy-tool-util/core";
import { ToolFetchError, getToolRevisions } from "@galaxy-tool-util/search";

import { toTrsToolId } from "./tool-versions.js";

export interface ToolRevisionsOptions {
  toolVersion?: string;
  latest?: boolean;
  json?: boolean;
}

export interface ToolRevisionsJsonOutput {
  trsToolId: string;
  version?: string;
  revisions: { changesetRevision: string; toolVersion: string }[];
}

export async function runToolRevisions(toolId: string, opts: ToolRevisionsOptions): Promise<void> {
  let trsToolId: string;
  try {
    trsToolId = toTrsToolId(toolId);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  const [owner, repo, xmlToolId] = trsToolId.split("~");

  let matches;
  try {
    matches = await getToolRevisions(DEFAULT_TOOLSHED_URL, {
      owner,
      repo,
      toolId: xmlToolId,
      version: opts.toolVersion,
    });
  } catch (err) {
    if (err instanceof ToolFetchError) {
      console.error(`Tool Shed request failed: ${err.message}`);
      process.exitCode = 3;
      return;
    }
    throw err;
  }

  const selected = opts.latest ? matches.slice(-1) : matches;
  const revisions = selected.map((m) => ({
    changesetRevision: m.changesetRevision,
    toolVersion: m.toolVersion,
  }));

  if (opts.json) {
    const envelope: ToolRevisionsJsonOutput = {
      trsToolId,
      ...(opts.toolVersion !== undefined ? { version: opts.toolVersion } : {}),
      revisions,
    };
    console.log(JSON.stringify(envelope, null, 2));
  } else if (revisions.length === 0) {
    const suffix = opts.toolVersion ? ` at version ${opts.toolVersion}` : "";
    console.error(`No revisions found for ${trsToolId}${suffix}`);
  } else {
    for (const r of revisions) console.log(`${r.changesetRevision}\t${r.toolVersion}`);
  }

  if (revisions.length === 0) process.exitCode = 2;
}
