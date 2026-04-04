/**
 * `galaxy-tool-cache populate-workflow` — scan workflow(s) for tool references
 * and populate the cache with each unique tool.
 */
import { ToolInfoService } from "@galaxy-tool-util/core";
import {
  expandedNative,
  expandedFormat2,
  type ToolReference,
  type ExpansionOptions,
} from "@galaxy-tool-util/schema";
import { dirname } from "node:path";
import { readWorkflowFile, resolveFormat } from "./workflow-io.js";
import { createDefaultResolver } from "./url-resolver.js";

export interface PopulateWorkflowOptions {
  cacheDir?: string;
  galaxyUrl?: string;
}

export async function runPopulateWorkflow(
  filePath: string,
  opts: PopulateWorkflowOptions,
): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;

  const format = resolveFormat(data);
  const workflowDirectory = dirname(filePath);
  const expansionOpts: ExpansionOptions = {
    resolver: createDefaultResolver({ workflowDirectory }),
  };

  let tools: Set<ToolReference>;
  if (format === "native") {
    const expanded = await expandedNative(data, expansionOpts);
    tools = expanded.unique_tools;
  } else {
    const expanded = await expandedFormat2(data, expansionOpts);
    tools = expanded.unique_tools;
  }

  if (tools.size === 0) {
    console.log("No tool steps found in workflow.");
    return;
  }

  const service = new ToolInfoService({
    cacheDir: opts.cacheDir,
    galaxyUrl: opts.galaxyUrl,
  });

  let cached = 0;
  let failed = 0;
  const total = tools.size;

  for (const ref of tools) {
    const result = await service.getToolInfo(ref.tool_id, ref.tool_version);
    if (result) {
      cached++;
      console.log(`  Cached: ${ref.tool_id} v${ref.tool_version ?? "latest"}`);
    } else {
      failed++;
      console.warn(`  Failed: ${ref.tool_id} v${ref.tool_version ?? "latest"}`);
    }
  }

  console.log(`\nPopulated ${cached}/${total} tools${failed > 0 ? `, ${failed} failed` : ""}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}
