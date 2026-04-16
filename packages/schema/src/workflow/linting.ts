/**
 * Generic linting primitives — port of gxformat2/linting.py.
 *
 * `LintMessage` is a structured emission carrying prose plus `level`,
 * `linter`, and `json_pointer` metadata. Field names are snake_case for
 * sync-clean diff with Python. `toString()` returns the prose so template
 * interpolation (`${m}`) and existing string-based callers keep working.
 */

export type LintLevel = "error" | "warn";
export const LEVEL_ERROR: LintLevel = "error";
export const LEVEL_WARN: LintLevel = "warn";

export class LintMessage {
  readonly message: string;
  readonly level: LintLevel;
  readonly linter: string | null;
  readonly json_pointer: string;

  constructor(
    message: string,
    options: { level?: LintLevel; linter?: string | null; json_pointer?: string } = {},
  ) {
    this.message = message;
    this.level = options.level ?? LEVEL_WARN;
    this.linter = options.linter ?? null;
    this.json_pointer = options.json_pointer ?? "";
  }

  toString(): string {
    return this.message;
  }
}

/**
 * Metadata-only base for lint rules. Subclasses carry class-level metadata;
 * emission happens via `LintContext.error`/`warn` with `linter=Subclass`.
 */
export abstract class Linter {
  static severity: "error" | "warning" = "warning";
  static applies_to: readonly ("format2" | "native")[] = [];
  static profile: string = "structural";
}

export type LinterRef = typeof Linter | string | null;

function resolveLinterName(linter: LinterRef | undefined): string | null {
  if (linter == null) return null;
  if (typeof linter === "string") return linter;
  return linter.name;
}

function escapePointerSegment(segment: string | number): string {
  return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

export interface EmitOptions {
  linter?: LinterRef;
  json_pointer?: string;
}

export class LintContext {
  errors: LintMessage[] = [];
  warnings: LintMessage[] = [];
  private _pointer: string;

  constructor(pointer = "") {
    this._pointer = pointer;
  }

  error(message: string, options: EmitOptions = {}): void {
    this._emit(this.errors, LEVEL_ERROR, message, options);
  }

  warn(message: string, options: EmitOptions = {}): void {
    this._emit(this.warnings, LEVEL_WARN, message, options);
  }

  child(segment: string | number): LintContext {
    const newPointer = `${this._pointer}/${escapePointerSegment(segment)}`;
    const ctx = new LintContext(newPointer);
    ctx.errors = this.errors;
    ctx.warnings = this.warnings;
    return ctx;
  }

  private _emit(
    target: LintMessage[],
    level: LintLevel,
    message: string,
    options: EmitOptions,
  ): void {
    const pointer = options.json_pointer !== undefined ? options.json_pointer : this._pointer;
    const linter = resolveLinterName(options.linter);
    target.push(new LintMessage(message, { level, linter, json_pointer: pointer }));
  }
}

export interface LintResult {
  errors: LintMessage[];
  warnings: LintMessage[];
  error_count: number;
  warn_count: number;
}
