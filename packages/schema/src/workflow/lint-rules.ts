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

/** Step labels (including inputs) must be unique within a workflow; Galaxy refuses duplicates at import. */
export class StepLabelNotUnique extends Linter {
  static severity = "error" as const;
  static applies_to = ["format2", "native"] as const;
  static profile = "structural";
}

/** Frame `contains_steps` / `contains_comments` entries must name a step, input or comment of the workflow. */
export class FrameReferenceNotFound extends Linter {
  static severity = "error" as const;
  static applies_to = ["format2"] as const;
  static profile = "structural";
}

/** Frames should contain at least one step or comment; Galaxy draws an empty one as a bare box. */
export class FrameIsEmpty extends Linter {
  static severity = "warning" as const;
  static applies_to = ["format2"] as const;
  static profile = "best-practices";
}
