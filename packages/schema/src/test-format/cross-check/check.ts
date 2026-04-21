import type { TestFormatDiagnostic } from "../validate.js";
import { isCompatibleType, jsTypeOf } from "./type-compat.js";
import type { WorkflowInput, WorkflowOutput } from "./types.js";

/**
 * JSON-pointer escaping per RFC 6901 — `~` → `~0`, `/` → `~1`.
 */
function jptrEscape(s: string): string {
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

function jptr(parts: (string | number)[]): string {
  return "/" + parts.map((p) => jptrEscape(String(p))).join("/");
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

export interface WorkflowShape {
  inputs: WorkflowInput[];
  outputs: WorkflowOutput[];
}

/**
 * Cross-check a parsed tests document against workflow inputs/outputs. Emits
 * one diagnostic per violation with a JSON-pointer path into the tests doc
 * (matches Ajv's `instancePath`). Keywords:
 *
 *   workflow_input_undefined  job key not declared in workflow
 *   workflow_input_required   required workflow input missing from job (and no default)
 *   workflow_input_type       job value's JS type incompatible with declared type
 *   workflow_output_undefined output assertion name not declared in workflow
 */
export function checkTestsAgainstWorkflow(
  testsDoc: unknown,
  workflow: WorkflowShape,
): TestFormatDiagnostic[] {
  if (!Array.isArray(testsDoc)) return [];
  const inputByName = new Map(workflow.inputs.map((i) => [i.name, i]));
  const outputNames = new Set(workflow.outputs.map((o) => o.name));
  const diagnostics: TestFormatDiagnostic[] = [];

  for (let testIdx = 0; testIdx < testsDoc.length; testIdx++) {
    const entry = asRecord(testsDoc[testIdx]);
    if (!entry) continue;
    const job = asRecord(entry.job) ?? {};
    const outputs = asRecord(entry.outputs) ?? {};

    // Inputs: flag unknowns, check types.
    for (const [name, value] of Object.entries(job)) {
      const declared = inputByName.get(name);
      if (!declared) {
        diagnostics.push({
          path: jptr([testIdx, "job", name]),
          message: `Input '${name}' is not defined in the associated workflow.`,
          keyword: "workflow_input_undefined",
          params: { input: name },
        });
        continue;
      }
      const actualType = jsTypeOf(value);
      if (!isCompatibleType(declared.type, actualType)) {
        diagnostics.push({
          path: jptr([testIdx, "job", name]),
          message: `Input '${name}' has an invalid type. Expected '${declared.type}' but found '${actualType}'.`,
          keyword: "workflow_input_type",
          params: { input: name, declaredType: declared.type, actualType },
        });
      }
    }

    // Inputs: flag required ones missing from the job.
    for (const declared of workflow.inputs) {
      if (declared.optional === true) continue;
      if (declared.default !== undefined) continue;
      if (Object.prototype.hasOwnProperty.call(job, declared.name)) continue;
      diagnostics.push({
        path: jptr([testIdx, "job"]),
        message: `Input '${declared.name}' is required but no value or default was provided.`,
        keyword: "workflow_input_required",
        params: { input: declared.name },
      });
    }

    // Outputs: flag assertions for outputs the workflow doesn't declare.
    for (const name of Object.keys(outputs)) {
      if (!outputNames.has(name)) {
        diagnostics.push({
          path: jptr([testIdx, "outputs", name]),
          message: `Output '${name}' is not defined in the associated workflow.`,
          keyword: "workflow_output_undefined",
          params: { output: name },
        });
      }
    }
  }

  return diagnostics;
}
