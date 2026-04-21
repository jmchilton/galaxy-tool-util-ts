/**
 * Lint rule classes.
 *
 * Each `Linter` subclass carries metadata only (severity, applies_to,
 * profile). Emission happens in `lint.ts` via `LintContext.warn`/`error`
 * with `linter=<Subclass>`.
 */

import { Linter } from "./linting.js";

/** Native workflow step keys must be string representations of integers. */
export class NativeStepKeyNotInteger extends Linter {
  static severity = "error" as const;
  static applies_to = ["native"] as const;
  static profile = "structural";
}
