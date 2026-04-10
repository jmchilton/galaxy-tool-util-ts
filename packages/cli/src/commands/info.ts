import { ToolCache, cacheKey } from "@galaxy-tool-util/core";

export interface InfoOptions {
  version?: string;
  cacheDir?: string;
}

export async function runInfo(toolId: string, opts: InfoOptions): Promise<void> {
  const cache = new ToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();
  const coords = cache.resolveToolCoordinates(toolId, opts.version);
  if (coords.version === null) {
    console.error(`No version specified for tool: ${toolId}`);
    process.exitCode = 1;
    return;
  }
  const key = await cacheKey(coords.toolshedUrl, coords.trsToolId, coords.version);
  const tool = await cache.loadCached(key);
  if (tool === null) {
    console.error(`Tool not found in cache: ${toolId}`);
    process.exitCode = 1;
    return;
  }

  const indexEntry = (await cache.index.listAll()).find((e) => e.cache_key === key);

  console.log(`Name:        ${tool.name}`);
  console.log(`ID:          ${tool.id}`);
  console.log(`Version:     ${tool.version ?? "unknown"}`);
  console.log(`Description: ${tool.description ?? ""}`);
  console.log(`Inputs:      ${tool.inputs.length}`);
  console.log(`Outputs:     ${tool.outputs.length}`);
  console.log(`Profile:     ${tool.profile ?? "none"}`);
  console.log(`License:     ${tool.license ?? "none"}`);
  if (indexEntry) {
    console.log(`Source:      ${indexEntry.source}`);
    console.log(`Cached at:   ${indexEntry.cached_at}`);
  }
}
