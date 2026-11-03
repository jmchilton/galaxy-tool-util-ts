/**
 * Check the `inputs.*` member paths a user-defined tool reads against what its
 * inputs hold.
 *
 * `shell_command` and `configfiles[].content` are JavaScript templates: their
 * member chains (`./template-chains.ts`) resolve against the job runtime
 * `inputs` object (`./runtime-shape.ts`). Output `label` references resolve
 * against the tool state Galaxy fills them in from (`./label-references.ts`).
 *
 * This is stricter than Galaxy: its model validators only check that each
 * referenced root input is declared. `validateUserToolSource` leaves unknown
 * root names to that mirrored check (`./semantic.ts`), so each mistake is
 * reported once; callers that don't run it ask for them with `undeclaredRoots`.
 */

import type { ToolParameterModel } from "../schema/bundle-types.js";
import { parseInputs } from "../user-tool-parse/inputs.js";
import { labelReferences, resolveLabelReference } from "./label-references.js";
import { inputShapes, resolveChain, type RuntimeShape } from "./runtime-shape.js";
import { declaredInputNames } from "./semantic.js";
import { templateChains } from "./template-chains.js";
import type { UserToolSourceDiagnostic } from "./validate.js";

const KEYWORD = "input_path";

function diag(path: string, message: string): UserToolSourceDiagnostic {
  return { path, message, keyword: KEYWORD, params: {} };
}

/** A tool's inputs, as the references in its templates and labels see them. */
interface ToolInputs {
  /** Every top-level input name, including those the parser skipped. */
  declared: ReadonlySet<string>;
  params: readonly ToolParameterModel[];
  shapes: ReadonlyMap<string, RuntimeShape>;
  reportUndeclared: boolean;
}

function undeclared(name: string): string {
  return `no input named '${name}' is declared`;
}

function checkTemplate(
  template: unknown,
  pointer: string,
  tool: ToolInputs,
): UserToolSourceDiagnostic[] {
  if (typeof template !== "string") return [];
  const problems = new Set<string>();
  for (const chain of templateChains(template)) {
    const root = chain[0];
    if (root !== null && !tool.declared.has(root)) {
      if (tool.reportUndeclared) problems.add(`inputs.${root}: ${undeclared(root)}`);
      continue;
    }
    const problem = resolveChain(chain, tool.shapes);
    if (problem) problems.add(problem);
  }
  return [...problems].map((m) => diag(pointer, m));
}

function checkLabel(label: unknown, pointer: string, tool: ToolInputs): UserToolSourceDiagnostic[] {
  if (typeof label !== "string") return [];
  const errors: UserToolSourceDiagnostic[] = [];
  const report = (text: string, problem: string) =>
    errors.push(diag(pointer, `label reference ${text} is never filled in: ${problem}`));
  for (const { text, keys } of labelReferences(label)) {
    const root = keys[0];
    if (!tool.declared.has(root)) {
      if (tool.reportUndeclared) report(text, undeclared(root));
      continue;
    }
    const problem = resolveLabelReference(keys, tool.params);
    if (problem) report(text, problem);
  }
  return errors;
}

export interface CheckInputPathsOptions {
  /**
   * Also report references to inputs no input declares. `validateUserToolSource`
   * leaves those to the undeclared input check that mirrors Galaxy.
   */
  undeclaredRoots?: boolean;
}

/**
 * Report `inputs.*` member paths in `shell_command`, `configfiles[].content`
 * and output `label`s that the job's inputs won't have, or that Galaxy never fills in.
 */
export function checkInputPaths(
  doc: Record<string, unknown>,
  opts: CheckInputPathsOptions = {},
): UserToolSourceDiagnostic[] {
  const params = parseEachInput(doc.inputs);
  const tool: ToolInputs = {
    declared: declaredInputNames(doc),
    params,
    shapes: inputShapes(params),
    reportUndeclared: !!opts.undeclaredRoots,
  };
  const errors = checkTemplate(doc.shell_command, "/shell_command", tool);
  if (Array.isArray(doc.configfiles)) {
    doc.configfiles.forEach((cf, idx) => {
      if (cf && typeof cf === "object") {
        const content = (cf as Record<string, unknown>).content;
        errors.push(...checkTemplate(content, `/configfiles/${idx}/content`, tool));
      }
    });
  }
  if (Array.isArray(doc.outputs)) {
    doc.outputs.forEach((out, idx) => {
      if (out && typeof out === "object") {
        const label = (out as Record<string, unknown>).label;
        errors.push(...checkLabel(label, `/outputs/${idx}/label`, tool));
      }
    });
  }
  return errors;
}

/**
 * Parse each top-level input on its own, so one the parser rejects leaves the
 * others checked: a malformed entry the structural schema reports, or a YAML
 * `section` (the TS YAML parser doesn't read sections, though Galaxy's
 * `CanonicalYamlInputSource` does), anywhere inside the input. References to a
 * skipped input are left alone.
 */
function parseEachInput(raw: unknown): ToolParameterModel[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((input) => {
    try {
      return parseInputs([input]);
    } catch {
      return [];
    }
  });
}
