/**
 * Workflow side of ``validate-tests`` / ``validate-tests-tree`` cross-checks:
 * extract the workflow shape, resolve output collection types through the
 * connection graph (local tool cache only), and check with the bundled
 * Galaxy datatypes snapshot.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { resolveWorkflowOutputCollectionTypes } from "@galaxy-tool-util/connection-validation";
import {
  checkTestsAgainstWorkflow,
  extractWorkflowInputs,
  extractWorkflowOutputs,
  resolveFormat,
  type TestFormatDiagnostic,
  type WorkflowShape,
} from "@galaxy-tool-util/schema";
import { snapshotDatatypesMapper } from "@galaxy-tool-util/workflow-graph/datatypes-snapshot";

import { buildGetToolInfo } from "./connection-validation.js";
import { makeValidationResolver } from "./resolve-tool.js";

export interface TestsCrossCheckOptions {
  /** Tool cache read (never fetched) to resolve tool-step output shapes. */
  cacheDir?: string;
}

async function loadWorkflowShape(
  path: string,
  opts: TestsCrossCheckOptions,
): Promise<WorkflowShape> {
  const raw = await readFile(path, "utf-8");
  const parsed: unknown =
    path.endsWith(".ga") || path.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Workflow ${path} did not parse to an object.`);
  }
  const dict = parsed as Record<string, unknown>;
  const format = resolveFormat(dict);
  const outputs = extractWorkflowOutputs(dict, format);
  const collectionTypes = await resolveOutputCollectionTypes(dict, opts);
  return {
    inputs: extractWorkflowInputs(dict, format),
    outputs: outputs.map((o) =>
      o.name in collectionTypes ? { ...o, collectionType: collectionTypes[o.name] } : o,
    ),
  };
}

async function resolveOutputCollectionTypes(
  workflow: Record<string, unknown>,
  opts: TestsCrossCheckOptions,
): Promise<Record<string, string | null>> {
  const { cache } = makeValidationResolver({ cacheDir: opts.cacheDir, offline: true });
  try {
    const getToolInfo = await buildGetToolInfo(workflow, cache);
    return resolveWorkflowOutputCollectionTypes(workflow, getToolInfo);
  } catch {
    // Unresolvable graph: output shape checks are skipped, label checks still run.
    return {};
  }
}

/** Cross-check a parsed tests doc against the workflow at `workflowPath`. */
export async function crossCheckTests(
  testsDoc: unknown,
  workflowPath: string,
  opts: TestsCrossCheckOptions = {},
): Promise<TestFormatDiagnostic[]> {
  const shape = await loadWorkflowShape(workflowPath, opts);
  return checkTestsAgainstWorkflow(testsDoc, shape, { datatypes: snapshotDatatypesMapper() });
}

/** Split diagnostics into errors (severity absent or `error`) and warnings. */
export function partitionDiagnostics(diagnostics: TestFormatDiagnostic[]): {
  errors: TestFormatDiagnostic[];
  warnings: TestFormatDiagnostic[];
} {
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const errors = diagnostics.filter((d) => d.severity !== "warning");
  return { errors, warnings };
}
