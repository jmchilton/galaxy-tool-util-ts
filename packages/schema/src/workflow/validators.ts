/**
 * Shared Effect-schema validator dispatch for workflow dict inputs.
 *
 * Mirrors gxformat2/validators.py. Callers pass a parsed workflow dict and get
 * back the decoded value or throw on validation failure. Used by the schema-rule
 * catalog runner and declarative-operation tests.
 *
 * The generated Effect schemas make `class` a required literal. Native `.ga`
 * files never carry it and Format2 inline `run:` subworkflows may omit it, so
 * `withDecodeClass` injects it there; a Format2 root must declare it
 * (`Format2MissingClass`, gxformat2 #278).
 */

import { Schema } from "effect";

import type { WorkflowFormat } from "./detect-format.js";
import { GalaxyWorkflowSchema } from "./raw/gxformat2.effect.js";
import { NativeGalaxyWorkflowSchema } from "./raw/native.effect.js";
import { validateWorkflowSemantics } from "./semantic-validators.js";

/**
 * Return `raw` with `class: cls` injected if missing, and the same injection
 * applied recursively to step subworkflows. Native steps embed subworkflows
 * under `.subworkflow`; format2 steps embed them under `.run` (when `run` is
 * an inline dict, not a URL).
 *
 * The cls string must match the parent document's class: nested format2
 * subworkflows inherit `"GalaxyWorkflow"`, native inherit `"NativeGalaxyWorkflow"`.
 */
export function withClass(raw: unknown, cls: string): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  return withStepSubworkflowClass("class" in obj ? obj : { ...obj, class: cls }, cls);
}

/** Inject `class` where decoding needs it: everywhere for native, inline runs only for Format2. */
export function withDecodeClass(raw: unknown, format: WorkflowFormat): unknown {
  if (format === "native") return withClass(raw, "NativeGalaxyWorkflow");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return withStepSubworkflowClass(raw as Record<string, unknown>, "GalaxyWorkflow");
}

function withStepSubworkflowClass(
  obj: Record<string, unknown>,
  cls: string,
): Record<string, unknown> {
  const result = { ...obj };
  const steps = result.steps;
  if (!steps || typeof steps !== "object") return result;

  if (Array.isArray(steps)) {
    result.steps = steps.map((step) => injectStepSubworkflow(step, cls));
  } else {
    const next: Record<string, unknown> = {};
    for (const [key, step] of Object.entries(steps as Record<string, unknown>)) {
      next[key] = injectStepSubworkflow(step, cls);
    }
    result.steps = next;
  }
  return result;
}

function injectStepSubworkflow(step: unknown, cls: string): unknown {
  if (!step || typeof step !== "object") return step;
  const s = step as Record<string, unknown>;
  if (s.subworkflow && typeof s.subworkflow === "object") {
    return { ...s, subworkflow: withClass(s.subworkflow, cls) };
  }
  // format2 steps embed subworkflows under `run` when it's an inline dict.
  // Skip string runs (URLs) and missing runs.
  if (s.run && typeof s.run === "object" && !Array.isArray(s.run)) {
    return { ...s, run: withClass(s.run, cls) };
  }
  return s;
}

export function validateFormat2(wf: unknown): unknown {
  const decoded = Schema.decodeUnknownSync(GalaxyWorkflowSchema, { onExcessProperty: "ignore" })(
    withDecodeClass(wf, "format2"),
  );
  validateWorkflowSemantics(wf);
  return decoded;
}

export function validateFormat2Strict(wf: unknown): unknown {
  const decoded = Schema.decodeUnknownSync(GalaxyWorkflowSchema, { onExcessProperty: "error" })(
    withDecodeClass(wf, "format2"),
  );
  validateWorkflowSemantics(wf);
  return decoded;
}

export function validateNative(wf: unknown): unknown {
  return Schema.decodeUnknownSync(NativeGalaxyWorkflowSchema, { onExcessProperty: "ignore" })(
    withDecodeClass(wf, "native"),
  );
}

export function validateNativeStrict(wf: unknown): unknown {
  return Schema.decodeUnknownSync(NativeGalaxyWorkflowSchema, { onExcessProperty: "error" })(
    withDecodeClass(wf, "native"),
  );
}

/**
 * Pick the validator matching a fixture filename's format.
 *
 * `.ga` → native; anything else → format2. `strict` picks the closed-schema
 * flavor that rejects unknown fields.
 */
export function validatorForFixture(
  fixtureName: string,
  strict: boolean,
): (wf: unknown) => unknown {
  if (fixtureName.endsWith(".ga")) {
    return strict ? validateNativeStrict : validateNative;
  }
  return strict ? validateFormat2Strict : validateFormat2;
}
