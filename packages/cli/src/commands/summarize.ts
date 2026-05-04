import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { getCacheDir, makeNodeToolCache } from "@galaxy-tool-util/core/node";
import {
  createFieldModel,
  type ParsedTool,
  type StateRepresentation,
  type ToolParameterBundleModel,
} from "@galaxy-tool-util/schema";
import * as JSONSchema from "effect/JSONSchema";
import { isResolveError, loadCachedTool } from "./resolve-tool.js";

export interface SummarizeOptions {
  version?: string;
  output?: string;
  cacheDir?: string;
}

export interface GalaxyToolSummaryManifest {
  schema_version: 1;
  tool_id: string;
  tool_version: string | null;
  cache_key: string;
  source: {
    kind: "toolshed" | "galaxy" | "local" | "orphan" | "unknown";
    label: string;
    url: string;
    cached_at: string | null;
  };
  artifacts: {
    parsed_tool_path: string;
    raw_tool_source_path: string | null;
  };
  parsed_tool: ParsedTool;
  input_schemas: {
    workflow_step: unknown | null;
    workflow_step_linked: unknown | null;
  };
  warnings: string[];
}

function sourceKind(label: string | undefined): GalaxyToolSummaryManifest["source"]["kind"] {
  if (label === "api") return "toolshed";
  if (label === "galaxy" || label === "local" || label === "orphan") return label;
  return "unknown";
}

function inputSchemaFor(
  tool: ParsedTool,
  rep: StateRepresentation,
  warnings: string[],
): unknown | null {
  const bundle: ToolParameterBundleModel = {
    parameters: tool.inputs as ToolParameterBundleModel["parameters"],
  };
  const effectSchema = createFieldModel(bundle, rep);
  if (effectSchema === undefined) {
    warnings.push(`${rep} input schema could not be generated for this tool`);
    return null;
  }
  try {
    return JSONSchema.make(effectSchema);
  } catch (err) {
    warnings.push(
      `${rep} input schema generation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function buildToolSummaryManifest(
  toolId: string,
  opts: SummarizeOptions,
): Promise<GalaxyToolSummaryManifest | null> {
  const cacheDir = getCacheDir(opts.cacheDir);
  const cache = makeNodeToolCache({ cacheDir });
  await cache.index.load();
  const result = await loadCachedTool(cache, toolId, opts.version);
  if (isResolveError(result)) {
    if (result.kind === "no_version") {
      console.error(`No version specified for tool: ${toolId}`);
    } else {
      console.error(`Tool not found in cache: ${toolId}. Run 'galaxy-tool-cache add' first.`);
    }
    process.exitCode = 1;
    return null;
  }

  const indexEntry = (await cache.index.listAll()).find((entry) => entry.cache_key === result.key);
  const warnings: string[] = [];
  const manifest: GalaxyToolSummaryManifest = {
    schema_version: 1,
    tool_id: result.tool.id,
    tool_version: result.tool.version,
    cache_key: result.key,
    source: {
      kind: sourceKind(indexEntry?.source),
      label: indexEntry?.source ?? "unknown",
      url: indexEntry?.source_url ?? "",
      cached_at: indexEntry?.cached_at ?? null,
    },
    artifacts: {
      parsed_tool_path: join(cacheDir, `${result.key}.json`),
      raw_tool_source_path: null,
    },
    parsed_tool: result.tool,
    input_schemas: {
      workflow_step: inputSchemaFor(result.tool, "workflow_step", warnings),
      workflow_step_linked: inputSchemaFor(result.tool, "workflow_step_linked", warnings),
    },
    warnings,
  };
  return manifest;
}

export async function runSummarize(toolId: string, opts: SummarizeOptions): Promise<void> {
  const manifest = await buildToolSummaryManifest(toolId, opts);
  if (manifest === null) return;
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  if (opts.output) {
    await writeFile(opts.output, output);
    console.log(`Summary written to ${opts.output}`);
  } else {
    process.stdout.write(output);
  }
}
