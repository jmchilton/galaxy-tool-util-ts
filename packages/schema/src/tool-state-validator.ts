import type { ToolInfoService } from "@galaxy-tool-util/core";
import type { ToolParameterModel } from "./schema/bundle-types.js";
import {
  ConversionValidationFailure,
  validateFormat2StepState,
  validateFormat2StepStateStrict,
  validateNativeStepState,
  type ToolStateDiagnostic,
} from "./workflow/stateful-validate.js";

// Re-export so consumers can import the type from this module without
// needing to know its definition lives in stateful-validate.
export type { ToolStateDiagnostic };

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

  /**
   * Strict variant: reports unknown parameter keys as diagnostics.
   *
   * Unlike {@link validateFormat2Step} (which uses `onExcessProperty: "ignore"`),
   * this variant treats excess keys as errors — intended for LSP diagnostics
   * where unknown params should be flagged. Returns structured diagnostics
   * with dot-separated paths so callers can locate issues in the YAML AST.
   */
  async validateFormat2StepStrict(
    toolId: string,
    toolVersion: string | null,
    format2State: Record<string, unknown>,
  ): Promise<ToolStateDiagnostic[]> {
    const parsed = await this.toolInfo.getToolInfo(toolId, toolVersion).catch(() => null);
    if (!parsed) return [];
    const inputs = parsed.inputs as ToolParameterModel[];
    return validateFormat2StepStateStrict(inputs, format2State);
  }
}
