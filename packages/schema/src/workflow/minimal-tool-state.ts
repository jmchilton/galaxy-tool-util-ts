import type { ParsedTool } from "../schema/parsed-tool.js";

/**
 * Returns the smallest `tool_state` object such that a freshly inserted step
 * is valid. Today this is always `{}` — schema decoders and state validators
 * handle missing keys via default conditional branches and parameter defaults,
 * so there is no need to seed anything.
 *
 * This function exists as the designated extension point if that ever changes
 * (a new parameter type, a decoder tightening, a validator that needs explicit
 * scaffolding). Callers — the step-skeleton generator, the LSP server, future
 * consumers — invoke this instead of hardcoding `{}`, so a single patch shifts
 * the semantics without a codebase sweep.
 */
export function buildMinimalToolState(_tool: ParsedTool): Record<string, unknown> {
  return {};
}
