/**
 * `gxwf convert` — convert between native (.ga) and format2 (.gxwf.yml) formats.
 */
import { toFormat2, toNative, type WorkflowFormat } from "@galaxy-tool-util/schema";
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
  if (targetFormat === "format2") {
    result = toFormat2(data) as unknown as Record<string, unknown>;
    if (opts.compact) {
      stripPositionInfo(result);
    }
  } else {
    result = toNative(data) as unknown as Record<string, unknown>;
  }

  const output = serializeWorkflow(result, targetFormat, { json: opts.json, yaml: opts.yaml });
  await writeWorkflowOutput(output, opts.output, "Converted workflow");
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
