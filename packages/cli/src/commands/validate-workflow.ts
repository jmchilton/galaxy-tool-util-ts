import { ToolCache } from "@galaxy-tool-util/core";
import {
  createFieldModel,
  GalaxyWorkflowSchema,
  NativeGalaxyWorkflowSchema,
  type ToolParameterBundleModel,
} from "@galaxy-tool-util/schema";
import * as ParseResult from "effect/ParseResult";
import * as S from "effect/Schema";
import { readFile } from "node:fs/promises";
import * as YAML from "yaml";
import { isResolveError, loadCachedTool } from "./resolve-tool.js";

export type WorkflowFormat = "format2" | "native";

export interface ValidateWorkflowOptions {
  format?: string;
  toolState?: boolean;
  cacheDir?: string;
}

/** Intermediate representation for a workflow step with tool info.
 *  `state` = format2's structured state dict; `toolState` = native's tool_state (JSON string or dict). */
interface StepWithToolInfo {
  stepLabel: string;
  toolId: string | null;
  toolVersion: string | null;
  state: Record<string, unknown> | null;
  toolState: string | Record<string, unknown> | null;
}

function detectFormat(data: Record<string, unknown>): WorkflowFormat {
  if ("a_galaxy_workflow" in data) return "native";
  if (data.class === "GalaxyWorkflow") return "format2";
  if ("format-version" in data) return "native";
  return "format2";
}

function extractSteps(data: Record<string, unknown>, format: WorkflowFormat): StepWithToolInfo[] {
  const steps: StepWithToolInfo[] = [];

  if (format === "native") {
    const stepsObj = data.steps as Record<string, Record<string, unknown>> | undefined;
    if (!stepsObj) return steps;
    for (const [key, step] of Object.entries(stepsObj)) {
      const toolId = (step.tool_id as string) ?? null;
      if (!toolId) continue;
      const toolVersion = (step.tool_version as string) ?? null;
      const toolState =
        step.tool_state != null
          ? typeof step.tool_state === "string"
            ? (step.tool_state as string)
            : (step.tool_state as Record<string, unknown>)
          : null;
      steps.push({
        stepLabel: (step.label as string) ?? `step ${key}`,
        toolId,
        toolVersion,
        state: null,
        toolState,
      });
    }
  } else {
    const rawSteps = data.steps;
    const stepList: Record<string, unknown>[] = Array.isArray(rawSteps)
      ? rawSteps
      : rawSteps && typeof rawSteps === "object"
        ? Object.values(rawSteps as Record<string, unknown>)
        : [];
    for (const step of stepList) {
      const s = step as Record<string, unknown>;
      const toolId = (s.tool_id as string) ?? null;
      if (!toolId) continue;
      const toolVersion = (s.tool_version as string) ?? null;
      const state =
        s.state != null && typeof s.state === "object"
          ? (s.state as Record<string, unknown>)
          : null;
      const toolState =
        s.tool_state != null
          ? typeof s.tool_state === "string"
            ? (s.tool_state as string)
            : (s.tool_state as Record<string, unknown>)
          : null;
      steps.push({
        stepLabel: (s.label as string) ?? (s.id as string) ?? "unlabeled",
        toolId,
        toolVersion,
        state,
        toolState,
      });
    }
  }
  return steps;
}

function parseToolState(step: StepWithToolInfo): Record<string, unknown> | null {
  if (step.state) return step.state;
  if (step.toolState == null) return null;
  if (typeof step.toolState === "object") return step.toolState;
  try {
    const parsed = JSON.parse(step.toolState);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // not valid JSON
  }
  return null;
}

function formatIssues(error: ParseResult.ParseError): string[] {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error);
  return issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

export async function runValidateWorkflow(
  filePath: string,
  opts: ValidateWorkflowOptions,
): Promise<void> {
  const raw = await readFile(filePath, "utf-8");
  let data: Record<string, unknown>;
  try {
    if (filePath.endsWith(".ga") || filePath.endsWith(".json")) {
      data = JSON.parse(raw);
    } else {
      data = YAML.parse(raw);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to parse ${filePath}: ${msg}`);
    process.exitCode = 1;
    return;
  }

  const format: WorkflowFormat =
    opts.format === "native" || opts.format === "format2"
      ? opts.format
      : detectFormat(data);

  console.log(`Detected format: ${format}`);

  // --- structural validation ---
  // schema-salad schemas require a `class` discriminator that real files may omit
  const validationData = { ...data };
  if (format === "native" && !("class" in validationData)) {
    validationData.class = "NativeGalaxyWorkflow";
  } else if (format === "format2" && !("class" in validationData)) {
    validationData.class = "GalaxyWorkflow";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema: S.Schema<any> =
    format === "native" ? NativeGalaxyWorkflowSchema : GalaxyWorkflowSchema;
  const decode = S.decodeUnknownEither(schema, { onExcessProperty: "ignore" });
  const structResult = decode(validationData);

  let structOk = true;
  if (structResult._tag === "Left") {
    structOk = false;
    console.error(`\nStructural validation errors:`);
    for (const line of formatIssues(structResult.left)) {
      console.error(`  ${line}`);
    }
  } else {
    console.log(`Structural validation: OK`);
  }

  // --- tool state validation ---
  if (opts.toolState === false) {
    process.exitCode = structOk ? 0 : 1;
    return;
  }

  const steps = extractSteps(data, format);
  if (steps.length === 0) {
    console.log("No tool steps to validate state for.");
    process.exitCode = structOk ? 0 : 1;
    return;
  }

  const cache = new ToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();

  let stateOk = true;
  let validated = 0;
  let skipped = 0;

  for (const step of steps) {
    const stateData = parseToolState(step);
    if (!stateData) {
      skipped++;
      continue;
    }

    const resolved = await loadCachedTool(cache, step.toolId!, step.toolVersion);
    if (isResolveError(resolved)) {
      const reason =
        resolved.kind === "no_version"
          ? `no version for ${step.toolId}`
          : `${step.toolId} not in cache`;
      console.warn(`  [${step.stepLabel}] skipped — ${reason}`);
      skipped++;
      continue;
    }

    const bundle: ToolParameterBundleModel = {
      parameters: resolved.tool.inputs as ToolParameterBundleModel["parameters"],
    };
    const fieldModel = createFieldModel(bundle, "workflow_step");
    if (!fieldModel) {
      console.warn(`  [${step.stepLabel}] skipped — unsupported parameter types`);
      skipped++;
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stateValidate = S.decodeUnknownEither(fieldModel as S.Schema<any>, {
      onExcessProperty: "ignore",
    });
    const result = stateValidate(stateData);
    validated++;

    if (result._tag === "Left") {
      stateOk = false;
      console.error(`  [${step.stepLabel}] tool_state errors (${step.toolId}):`);
      for (const line of formatIssues(result.left)) {
        console.error(`    ${line}`);
      }
    } else {
      console.log(`  [${step.stepLabel}] tool_state: OK`);
    }
  }

  console.log(`\nTool state: ${validated} validated, ${skipped} skipped`);
  process.exitCode = structOk && stateOk ? 0 : 1;
}
