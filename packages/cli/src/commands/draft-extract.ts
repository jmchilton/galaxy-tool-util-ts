/**
 * `gxwf draft-extract` — extract the concrete subset of a draft workflow.
 *
 * Runs `extractConcreteSubset` from @galaxy-tool-util/schema, strips
 * `_plan_*` planning fields, and promotes `class: GalaxyWorkflowDraft` →
 * `class: GalaxyWorkflow` on any (sub)workflow that is now fully concrete.
 * Emits the trimmed workflow to stdout (or `-o` file) and an optional
 * sidecar JSON report.
 *
 * Exit codes:
 *   0 — input parses + extract ran (including empty-extract case)
 *   2 — parse/read failure, native input rejected, or stdout-sink collision
 *       (workflow → stdout AND --report-json → stdout simultaneously)
 */
import { writeFile } from "node:fs/promises";
import {
  buildSingleDraftExtractReport,
  extractConcreteSubset,
  promoteFullyConcreteDrafts,
  resolveFormat,
  serializeWorkflow,
  stripPlanFields,
} from "@galaxy-tool-util/schema";
import { readWorkflowFile, writeWorkflowOutput } from "./workflow-io.js";
import { findStdoutSinkCollision, targetsStdout } from "./report-output.js";

export interface DraftExtractOptions {
  output?: string;
  reportJson?: string | boolean;
  format?: string;
}

export async function runDraftExtract(filePath: string, opts: DraftExtractOptions): Promise<void> {
  const collision = findStdoutSinkCollision([
    { flag: "<workflow output>", toStdout: !opts.output },
    { flag: "--report-json", toStdout: targetsStdout(opts.reportJson) },
  ]);
  if (collision) {
    console.error(collision);
    process.exitCode = 2;
    return;
  }

  const data = await readWorkflowFile(filePath);
  if (!data) {
    process.exitCode = 2;
    return;
  }

  const format = resolveFormat(data, opts.format);
  if (format === "native") {
    console.error("draft-extract requires format2 — native workflows cannot be drafts");
    process.exitCode = 2;
    return;
  }

  const extract = extractConcreteSubset(data);
  stripPlanFields(extract.workflow);
  const promote = promoteFullyConcreteDrafts(extract.workflow);

  const trimmed =
    extract.workflow != null && typeof extract.workflow === "object"
      ? (extract.workflow as Record<string, unknown>)
      : {};
  const classAfter: "GalaxyWorkflowDraft" | "GalaxyWorkflow" =
    trimmed.class === "GalaxyWorkflow" ? "GalaxyWorkflow" : "GalaxyWorkflowDraft";

  const outputFormat = outputFormatFor(opts.output, format);
  const serialized = serializeWorkflow(trimmed, outputFormat);
  await writeWorkflowOutput(serialized, opts.output, "Extracted workflow");

  if (opts.reportJson !== undefined) {
    const report = buildSingleDraftExtractReport(
      filePath,
      opts.output ?? null,
      extract,
      promote,
      classAfter,
    );
    const json = JSON.stringify(report, null, 2);
    const dest = opts.reportJson;
    if (dest === true || dest === "-") {
      console.log(json);
    } else {
      await writeFile(dest as string, json + "\n", "utf-8");
    }
  }

  process.exitCode = 0;
}

/**
 * Resolve the workflow serialization format from -o's extension, falling
 * back to the detected input format. `.ga` / `.json` → native (JSON);
 * `.gxwf.yml` / other → format2 (YAML).
 */
function outputFormatFor(
  output: string | undefined,
  fallback: "native" | "format2",
): "native" | "format2" {
  if (!output) return fallback;
  if (output.endsWith(".ga") || output.endsWith(".json")) return "native";
  return "format2";
}
