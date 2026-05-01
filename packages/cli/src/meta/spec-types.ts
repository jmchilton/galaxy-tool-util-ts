/**
 * Types for the declarative CLI spec — the source of truth for the
 * `gxwf` and `galaxy-tool-cache` programs. Specs live in `spec/*.yml`
 * and are loaded into commander at runtime by `build-program.ts`.
 *
 * Keep this aligned with `meta/types.ts` (which describes the *extracted*
 * shape after commander has parsed flag strings). Spec carries raw
 * commander-style flag strings; meta carries the parsed view.
 */

export interface SpecOption {
  /** Raw commander flag string, e.g. `--cache-dir <dir>` or `--no-tool-state`. */
  flags: string;
  description: string;
  /** Commander default; passed as the third arg to `.option()`. */
  default?: string | boolean;
}

export interface SpecArg {
  /** Raw commander argument form, e.g. `<file>`, `[output]`, `[items...]`. */
  raw: string;
  description?: string;
}

export interface SpecCommand {
  name: string;
  description: string;
  args?: SpecArg[];
  options?: SpecOption[];
  /** Names of shared option groups (resolved against `ProgramSpec.optionGroups`). */
  optionGroups?: string[];
  /** Key into the handler registry passed to `buildProgramFromSpec`. */
  handler: string;
}

export interface ProgramSpec {
  name: string;
  description: string;
  version: string;
  /** Reusable option groups (e.g. `strict` for the four strict-validation flags). */
  optionGroups?: Record<string, SpecOption[]>;
  commands: SpecCommand[];
}
