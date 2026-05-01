/**
 * Browser-safe type definitions for CLI program metadata.
 *
 * No runtime imports — pure types. Everything in `src/meta/` must remain
 * importable in a browser environment without polyfills. Enforced by
 * `test/meta-browser-safe.test.ts`.
 */

export interface CliOptionSpec {
  /** Long flag form, e.g. `--json` or `--cache-dir <dir>`. */
  flags: string;
  /** First long-form name without leading dashes or argument placeholder, e.g. `cache-dir`. */
  name: string;
  /** Short flag if present, e.g. `-j`. */
  short?: string;
  description: string;
  /** True when the flag itself takes an argument (`--foo <bar>`). */
  takesArgument: boolean;
  /** Optional argument placeholder text (`<dir>`, `[file]`). */
  argumentPlaceholder?: string;
  /** True for `[file]`-style optional arguments on the flag. */
  optionalArgument: boolean;
  /** True for negated boolean flags (`--no-tool-state`). */
  negatable: boolean;
  /** Default value, if commander recorded one. */
  defaultValue?: string | number | boolean;
}

export interface CliPositionalArgSpec {
  /** Argument name as declared, e.g. `<file>` or `[output]`. */
  raw: string;
  /** Name without brackets. */
  name: string;
  required: boolean;
  variadic: boolean;
  description?: string;
}

export interface CliCommandSpec {
  /** Command name as registered with commander (the leaf, no parent prefix). */
  name: string;
  /** Full path including parent program, e.g. `gxwf validate`. */
  fullName: string;
  description: string;
  /** Synopsis line, e.g. `gxwf validate <file> [options]`. */
  synopsis: string;
  args: CliPositionalArgSpec[];
  options: CliOptionSpec[];
  /** Subcommands, if this command groups others. */
  commands: CliCommandSpec[];
}

export interface CliProgramSpec {
  name: string;
  description: string;
  version: string;
  commands: CliCommandSpec[];
}
