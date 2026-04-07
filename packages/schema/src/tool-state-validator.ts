import type { ToolInfoService } from "@galaxy-tool-util/core";
import type { ToolParameterModel } from "./schema/bundle-types.js";
import {
  ConversionValidationFailure,
  validateFormat2StepState,
  validateNativeStepState,
} from "./workflow/stateful-validate.js";

/** A single diagnostic produced by tool-state validation. */
export interface ToolStateDiagnostic {
  /** Dot-separated parameter path, or "" for top-level / unlocated issues. */
  path: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * High-level bridge: given a {@link ToolInfoService}, validate tool_state
 * for a single workflow step without exposing Effect internals to callers.
 */
export class ToolStateValidator {
  constructor(private readonly toolInfo: ToolInfoService) {}

  async validateNativeStep(
    toolId: string,
    toolVersion: string | null,
    toolState: Record<string, unknown>,
    inputConnections: Record<string, unknown> = {},
  ): Promise<ToolStateDiagnostic[]> {
    const parsed = await this.toolInfo.getToolInfo(toolId, toolVersion).catch(() => null);
    if (!parsed) return [];
    const inputs = parsed.inputs as ToolParameterModel[];
    try {
      validateNativeStepState(inputs, toolState, inputConnections);
      return [];
    } catch (e) {
      if (e instanceof ConversionValidationFailure) {
        return e.issues.map((msg) => ({ path: "", message: msg, severity: "error" as const }));
      }
      throw e;
    }
  }

  async validateFormat2Step(
    toolId: string,
    toolVersion: string | null,
    format2State: Record<string, unknown>,
  ): Promise<ToolStateDiagnostic[]> {
    const parsed = await this.toolInfo.getToolInfo(toolId, toolVersion).catch(() => null);
    if (!parsed) return [];
    const inputs = parsed.inputs as ToolParameterModel[];
    try {
      validateFormat2StepState(inputs, format2State);
      return [];
    } catch (e) {
      if (e instanceof ConversionValidationFailure) {
        return e.issues.map((msg) => ({ path: "", message: msg, severity: "error" as const }));
      }
      throw e;
    }
  }
}
