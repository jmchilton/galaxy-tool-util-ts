import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import {
  createFieldModel,
  STATE_REPRESENTATIONS,
  type StateRepresentation,
  type ToolParameterBundleModel,
} from "@galaxy-tool-util/schema";
import * as JSONSchema from "effect/JSONSchema";
import { writeFile } from "node:fs/promises";
import { isResolveError, loadCachedTool } from "./resolve-tool.js";

export interface SchemaOptions {
  version?: string;
  representation?: string;
  output?: string;
  cacheDir?: string;
}

export async function runSchema(toolId: string, opts: SchemaOptions): Promise<void> {
  const repName = opts.representation ?? "workflow_step";
  if (!STATE_REPRESENTATIONS.includes(repName as StateRepresentation)) {
    console.error(
      `Unknown representation: ${repName}. Available: ${STATE_REPRESENTATIONS.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  const stateRep = repName as StateRepresentation;

  const cache = makeNodeToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();
  const result = await loadCachedTool(cache, toolId, opts.version);
  if (isResolveError(result)) {
    if (result.kind === "no_version") {
      console.error(`No version specified for tool: ${toolId}`);
    } else {
      console.error(`Tool not found in cache: ${toolId}. Run 'galaxy-tool-cache add' first.`);
    }
    process.exitCode = 1;
    return;
  }

  const bundle: ToolParameterBundleModel = {
    parameters: result.tool.inputs as ToolParameterBundleModel["parameters"],
  };

  const effectSchema = createFieldModel(bundle, stateRep as StateRepresentation);
  if (effectSchema === undefined) {
    console.error(`Could not generate schema — tool may contain unsupported parameter types.`);
    process.exitCode = 1;
    return;
  }

  let jsonSchema: unknown;
  try {
    jsonSchema = JSONSchema.make(effectSchema);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`JSON Schema generation failed: ${msg}`);
    process.exitCode = 1;
    return;
  }
  const output = JSON.stringify(jsonSchema, null, 2);

  if (opts.output) {
    await writeFile(opts.output, output);
    console.log(`Schema written to ${opts.output}`);
  } else {
    console.log(output);
  }
}
