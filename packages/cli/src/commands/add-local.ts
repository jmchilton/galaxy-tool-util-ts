import { makeNodeToolInfoService } from "@galaxy-tool-util/core/node";
import { loadToolFile } from "@galaxy-tool-util/tool-xml";

export interface AddLocalOptions {
  toolId?: string;
  toolVersion?: string;
  cacheDir?: string;
}

/**
 * Cache a tool parsed from a local file — the local-ingest counterpart to `add`
 * (which fetches from the ToolShed). Dispatches on extension like Galaxy's
 * `get_tool_source` (`.yml` → YAML, else → XML; CWL unsupported). Mirrors
 * Galaxy's `run_add_local`: a bare `<tool id>` is not a valid cache key, so
 * `--tool-id` (the full toolshed tool_id) is required even when the file carries
 * an id; the parsed id is surfaced only as a hint.
 */
export async function runAddLocal(toolPath: string, opts: AddLocalOptions): Promise<void> {
  let parsed;
  try {
    parsed = loadToolFile(toolPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to parse ${toolPath}: ${msg}`);
    process.exitCode = 1;
    return;
  }

  const toolId = opts.toolId;
  if (toolId == null) {
    if (parsed.id && parsed.version) {
      console.log(`Parsed tool: ${parsed.id} v${parsed.version}`);
      console.log("Use --tool-id to specify the full toolshed tool_id for proper cache keying.");
      process.exitCode = 1;
      return;
    }
    console.error("Cannot determine tool_id from tool file. Use --tool-id.");
    process.exitCode = 1;
    return;
  }

  const version = opts.toolVersion || parsed.version;
  if (version == null) {
    console.error("Cannot determine version. Use --tool-version.");
    process.exitCode = 1;
    return;
  }

  const service = makeNodeToolInfoService({ cacheDir: opts.cacheDir });
  await service.addTool(toolId, version, parsed, "local", toolPath);
  console.log(`Cached ${toolId} ${version} from ${toolPath}`);
}
