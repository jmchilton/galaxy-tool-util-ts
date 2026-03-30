import { ToolInfoService } from "@galaxy-tool-util/core";

export interface AddOptions {
  version?: string;
  cacheDir?: string;
  galaxyUrl?: string;
}

export async function runAdd(toolId: string, opts: AddOptions): Promise<void> {
  const service = new ToolInfoService({
    cacheDir: opts.cacheDir,
    galaxyUrl: opts.galaxyUrl,
  });

  const result = await service.getToolInfo(toolId, opts.version);
  if (result === null) {
    console.error(`Failed to fetch tool: ${toolId}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Cached: ${result.name} (${result.id} v${result.version})`);
}
