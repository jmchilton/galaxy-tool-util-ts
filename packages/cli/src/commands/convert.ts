/**
 * `gxwf convert` — convert between native (.ga) and format2 (.gxwf.yml) formats.
 */
import { ToolCache } from "@galaxy-tool-util/core";
import {
  toFormat2,
  toFormat2Stateful,
  toNative,
  toNativeStateful,
  type ExpansionOptions,
  type StepConversionStatus,
  type WorkflowFormat,
} from "@galaxy-tool-util/schema";
import { dirname } from "node:path";
import { loadToolInputsForWorkflow } from "./stateful-tool-inputs.js";
import { createDefaultResolver } from "./url-resolver.js";
import {
  readWorkflowFile,
  resolveFormat,
  serializeWorkflow,
  writeWorkflowOutput,
} from "./workflow-io.js";

export interface ConvertOptions {
  to?: string;
  output?: string;
  compact?: boolean;
  json?: boolean;
  yaml?: boolean;
  format?: string;
  stateful?: boolean;
  cacheDir?: string;
}

export async function runConvert(filePath: string, opts: ConvertOptions): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;

  const sourceFormat = resolveFormat(data, opts.format);
  const targetFormat = resolveTargetFormat(sourceFormat, opts.to);

  if (sourceFormat === targetFormat) {
    console.error(
      `Source and target formats are both ${sourceFormat}. ` +
        `Use --to to specify the target format.`,
    );
    process.exitCode = 1;
    return;
  }

  let result: Record<string, unknown>;
  let stepStatuses: StepConversionStatus[] | null = null;

  if (opts.stateful) {
    const cache = new ToolCache({ cacheDir: opts.cacheDir });
    await cache.index.load();

    if (cache.index.listAll().length === 0) {
      console.warn("Tool cache is empty — stateful conversion will fall back for every step");
    }

    const expansionOpts: ExpansionOptions = {
      resolver: createDefaultResolver({ workflowDirectory: dirname(filePath) }),
    };
    const { resolver, status: toolStatus } = await loadToolInputsForWorkflow(
      data,
      sourceFormat,
      cache,
      expansionOpts,
    );
    for (const s of toolStatus) {
      if (!s.loaded) {
        const ver = s.toolVersion ? `@${s.toolVersion}` : "";
        console.error(`  tool ${s.toolId}${ver}: ${s.error}`);
      }
    }

    if (targetFormat === "format2") {
      const r = toFormat2Stateful(data, resolver);
      result = r.workflow as unknown as Record<string, unknown>;
      stepStatuses = r.steps;
      if (opts.compact) stripPositionInfo(result);
    } else {
      const r = toNativeStateful(data, resolver);
      result = r.workflow as unknown as Record<string, unknown>;
      stepStatuses = r.steps;
    }
  } else if (targetFormat === "format2") {
    result = toFormat2(data) as unknown as Record<string, unknown>;
    if (opts.compact) {
      stripPositionInfo(result);
    }
  } else {
    result = toNative(data) as unknown as Record<string, unknown>;
  }

  const output = serializeWorkflow(result, targetFormat, { json: opts.json, yaml: opts.yaml });
  await writeWorkflowOutput(output, opts.output, "Converted workflow");

  if (stepStatuses !== null) {
    reportStepStatuses(stepStatuses);
  }
}

function reportStepStatuses(statuses: StepConversionStatus[]): void {
  const converted = statuses.filter((s) => s.converted).length;
  const failed = statuses.length - converted;
  console.error(
    `\nStateful conversion: ${converted}/${statuses.length} steps converted` +
      (failed > 0 ? `, ${failed} fell back` : ""),
  );
  for (const s of statuses) {
    if (!s.converted) {
      const label = s.toolId ? `${s.stepId} (${s.toolId})` : s.stepId;
      console.error(`  step ${label}: ${s.error ?? "unknown error"}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

function resolveTargetFormat(sourceFormat: WorkflowFormat, toOpt?: string): WorkflowFormat {
  if (toOpt === "native" || toOpt === "format2") return toOpt;
  // Infer opposite
  return sourceFormat === "native" ? "format2" : "native";
}

/** Recursively remove position-related keys from format2 output. */
function stripPositionInfo(obj: Record<string, unknown>): void {
  delete obj.position;
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object") {
          stripPositionInfo(item as Record<string, unknown>);
        }
      }
    } else if (val && typeof val === "object") {
      stripPositionInfo(val as Record<string, unknown>);
    }
  }
}
