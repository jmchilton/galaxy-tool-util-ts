/**
 * Tool-state validation support for steps that embed their tool definition
 * instead of referencing a cached tool: a format2 `run: {class: GalaxyUserTool}`
 * or a native `tool_representation`. The parameter bundle is parsed from the
 * embedded definition, so these steps validate without a tool cache lookup.
 */
import {
  isGalaxyUserToolRun,
  parseInlineTool,
  type ToolParameterBundleModel,
  type ValidationStepResult,
} from "@galaxy-tool-util/schema";

export interface EmbeddedTool {
  bundle: ToolParameterBundleModel;
  toolId: string | null;
  toolVersion: string | null;
}

/** The embedded tool definition a step carries, or null for a cache-referenced tool. */
export function embeddedToolDefinition(step: {
  run?: unknown;
  tool_representation?: unknown;
}): Record<string, unknown> | null {
  if (isGalaxyUserToolRun(step.run)) return step.run;
  const repr = step.tool_representation;
  if (repr && typeof repr === "object" && !Array.isArray(repr)) {
    return repr as Record<string, unknown>;
  }
  return null;
}

/** The id/version an embedded tool definition declares, for step results. */
export function embeddedToolIdentity(repr: Record<string, unknown>): {
  toolId: string | null;
  toolVersion: string | null;
} {
  return {
    toolId: typeof repr.id === "string" ? repr.id : null,
    toolVersion: repr.version == null ? null : String(repr.version),
  };
}

/**
 * Build the parameter bundle for an embedded tool definition. Returns a
 * finished step result instead when the definition can't be validated against:
 * `skip_tool_not_found` for a class other than `GalaxyUserTool` (admin-installed
 * `GalaxyTool` dynamic tools are out of scope), `fail` when the definition
 * doesn't parse — it ships inside the workflow, so a broken one is the
 * workflow's defect.
 */
export function resolveEmbeddedTool(
  repr: Record<string, unknown>,
  stepLabel: string,
): EmbeddedTool | ValidationStepResult {
  const { toolId, toolVersion } = embeddedToolIdentity(repr);
  if (repr.class !== "GalaxyUserTool") {
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      status: "skip_tool_not_found",
      errors: [
        `embedded tool definition of class ${JSON.stringify(repr.class)} is not validated (only GalaxyUserTool is supported)`,
      ],
    };
  }
  try {
    const parsed = parseInlineTool(repr);
    return {
      bundle: { parameters: parsed.inputs as ToolParameterBundleModel["parameters"] },
      toolId,
      toolVersion,
    };
  } catch (e) {
    return {
      step: stepLabel,
      tool_id: toolId,
      version: toolVersion,
      status: "fail",
      errors: [
        `embedded GalaxyUserTool definition could not be parsed: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }
}

export function isEmbeddedTool(value: EmbeddedTool | ValidationStepResult): value is EmbeddedTool {
  return "bundle" in value;
}
