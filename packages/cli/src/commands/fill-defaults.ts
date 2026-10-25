/**
 * `gxwf fill-defaults` — expand tool-state defaults on every tool step.
 */
import type { ToolCache, ToolInfoService } from "@galaxy-tool-util/core";
import {
  expandToolStateDefaults,
  findMissingConditionalTests,
  nativeConnectionsFromFormat2In,
  normalizeStepIn,
  serializeWorkflow,
  type ToolParameterModel,
} from "@galaxy-tool-util/schema";
import {
  describeResolveError,
  isResolveError,
  makeValidationResolver,
  resolveTool,
  type ValidationFetchOptions,
} from "./resolve-tool.js";
import { embeddedToolDefinition, isEmbeddedTool, resolveEmbeddedTool } from "./embedded-tool.js";
import { readWorkflowFile, resolveFormat, writeWorkflowOutput } from "./workflow-io.js";

export interface FillDefaultsOptions extends ValidationFetchOptions {
  output?: string;
  format?: string;
}

interface FillContext {
  cache: ToolCache;
  service?: ToolInfoService;
  warnings: string[];
  filled: number;
}

export async function runFillDefaults(filePath: string, opts: FillDefaultsOptions): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;
  const format = resolveFormat(data, opts.format);

  const { cache, service } = makeValidationResolver(opts);
  await cache.index.load();
  const ctx: FillContext = { cache, service, warnings: [], filled: 0 };

  if (format === "native") await fillNative(data, ctx, "");
  else await fillFormat2(data, ctx, "");

  for (const w of ctx.warnings) console.error(`Warning: ${w}`);
  console.error(`Filled defaults on ${ctx.filled} step(s)`);
  await writeWorkflowOutput(serializeWorkflow(data, format), opts.output, "Filled workflow");
}

async function fillNative(wf: Record<string, unknown>, ctx: FillContext, prefix: string) {
  const steps = (wf.steps ?? {}) as Record<string, Record<string, unknown>>;
  for (const [key, step] of Object.entries(steps)) {
    const label = `${prefix}${key}`;
    if (step.subworkflow && typeof step.subworkflow === "object") {
      await fillNative(step.subworkflow as Record<string, unknown>, ctx, `${label}.`);
      continue;
    }
    if (step.type === "subworkflow") {
      ctx.warnings.push(`step ${label}: subworkflow not inline; left as-is`);
      continue;
    }
    if (step.type !== "tool" || (!step.tool_id && !embeddedToolDefinition(step))) continue;
    if (typeof step.tool_state === "string") {
      ctx.warnings.push(`step ${label}: tool_state is a JSON string; run \`gxwf clean\` first`);
      continue;
    }
    const connected = Object.keys((step.input_connections ?? {}) as object);
    const filled = await fillStep(step, "tool_state", connected, label, ctx);
    if (filled) step.tool_state = filled;
  }
}

async function fillFormat2(wf: Record<string, unknown>, ctx: FillContext, prefix: string) {
  const raw = wf.steps ?? [];
  const entries: [string, Record<string, unknown>][] = Array.isArray(raw)
    ? raw.map((s, i) => [String(i), s])
    : Object.entries(raw as Record<string, Record<string, unknown>>);
  for (const [key, step] of entries) {
    const label = `${prefix}${key}`;
    const run = step.run as Record<string, unknown> | string | undefined;
    if (typeof run === "string") {
      ctx.warnings.push(`step ${label}: subworkflow \`${run}\` not inline; left as-is`);
      continue;
    }
    if (run && typeof run === "object" && run.class === "GalaxyWorkflow") {
      await fillFormat2(run, ctx, `${label}.`);
      continue;
    }
    if (!step.tool_id && !embeddedToolDefinition(step)) continue;
    // A verbatim native `tool_state` block takes the place of `state` when present.
    const field = step.state == null && step.tool_state != null ? "tool_state" : "state";
    if (typeof step[field] === "string") {
      ctx.warnings.push(`step ${label}: ${field} is a JSON string; run \`gxwf clean\` first`);
      continue;
    }
    const connected = Object.keys(nativeConnectionsFromFormat2In(normalizeStepIn(step.in)));
    const filled = await fillStep(step, field, connected, label, ctx);
    if (filled) step[field] = filled;
  }
}

async function fillStep(
  step: Record<string, unknown>,
  field: "state" | "tool_state",
  connected: string[],
  label: string,
  ctx: FillContext,
): Promise<Record<string, unknown> | null> {
  const tool = await resolveInputs(step, label, ctx);
  if (!tool) return null;
  const state = (step[field] ?? {}) as Record<string, unknown>;
  const filled = expandToolStateDefaults(tool.inputs, state, {
    connectedPaths: new Set(connected),
  });
  for (const m of findMissingConditionalTests(tool.inputs, filled)) {
    ctx.warnings.push(`step ${label} (${tool.toolId}): ${m}`);
  }
  if (JSON.stringify(filled) !== JSON.stringify(state)) ctx.filled++;
  return filled;
}

/** Tool inputs for a step: its embedded definition, else the cached/fetched tool. */
async function resolveInputs(
  step: Record<string, unknown>,
  label: string,
  ctx: FillContext,
): Promise<{ toolId: string | null; inputs: ToolParameterModel[] } | null> {
  const embedded = embeddedToolDefinition(step);
  if (embedded) {
    const tool = resolveEmbeddedTool(embedded, label);
    if (!isEmbeddedTool(tool)) {
      ctx.warnings.push(`step ${label}: ${tool.errors[0] ?? tool.status}; left as-is`);
      return null;
    }
    return { toolId: tool.toolId, inputs: tool.bundle.parameters };
  }
  const toolId = step.tool_id as string;
  const resolved = await resolveTool(
    ctx.cache,
    toolId,
    (step.tool_version as string | undefined) ?? null,
    ctx.service,
  );
  if (isResolveError(resolved)) {
    ctx.warnings.push(`step ${label} (${toolId}): ${describeResolveError(resolved)}; left as-is`);
    return null;
  }
  return { toolId, inputs: resolved.tool.inputs as ToolParameterModel[] };
}
