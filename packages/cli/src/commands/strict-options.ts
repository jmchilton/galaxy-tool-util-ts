/**
 * Strict validation options — decomposed into three orthogonal dimensions.
 *
 * --strict is shorthand for --strict-structure --strict-encoding --strict-state.
 */
import type { Command } from "commander";

export interface StrictOptions {
  strict?: boolean;
  strictStructure?: boolean;
  strictEncoding?: boolean;
  strictState?: boolean;
}

export interface ResolvedStrictOptions {
  strictStructure: boolean;
  strictEncoding: boolean;
  strictState: boolean;
}

/** Expand --strict shorthand into the three individual flags. */
export function resolveStrictOptions(opts: StrictOptions): ResolvedStrictOptions {
  const all = !!opts.strict;
  return {
    strictStructure: all || !!opts.strictStructure,
    strictEncoding: all || !!opts.strictEncoding,
    strictState: all || !!opts.strictState,
  };
}

/** Register --strict, --strict-structure, --strict-encoding, --strict-state on a Commander command. */
export function addStrictOptions(cmd: Command): Command {
  return cmd
    .option("--strict", "Shorthand for --strict-structure --strict-encoding --strict-state")
    .option("--strict-structure", "Reject unknown keys at envelope/step level")
    .option("--strict-encoding", "Reject JSON-string tool_state and format2 field misuse")
    .option("--strict-state", "Require every tool step to validate; no skips allowed");
}
