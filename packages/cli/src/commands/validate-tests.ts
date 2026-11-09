/**
 * ``gxwf validate-tests`` — validate a workflow-test file (``*-tests.yml`` /
 * ``*.gxwf-tests.yml``) against the JSON Schema synced from Galaxy's
 * ``galaxy.tool_util_models.Tests`` Pydantic model.
 *
 * With ``--workflow <path>`` also cross-checks inputs/outputs against the
 * referenced workflow: unknown job keys, missing required inputs, type
 * mismatches, unknown output assertions.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  checkTestsAgainstWorkflow,
  validateTestsFile,
  type TestFormatDiagnostic,
} from "@galaxy-tool-util/schema";
import { loadWorkflowTestShape, type WorkflowTestMetadataOptions } from "./workflow-test-shape.js";

export interface ValidateTestsOptions extends WorkflowTestMetadataOptions {
  json?: boolean;
  workflow?: string;
}

export interface ValidateTestsReport {
  file: string;
  valid: boolean;
  errors: TestFormatDiagnostic[];
}

export async function runValidateTests(
  filePath: string,
  opts: ValidateTestsOptions = {},
): Promise<void> {
  const raw = await readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      const report: ValidateTestsReport = {
        file: filePath,
        valid: false,
        errors: [
          { path: "(root)", message: `YAML parse error: ${msg}`, keyword: "yaml", params: {} },
        ],
      };
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error(`${filePath}: YAML parse error: ${msg}`);
    }
    process.exitCode = 2;
    return;
  }

  const { valid: schemaValid, errors } = validateTestsFile(parsed);
  const allErrors = [...errors];

  if (opts.workflow) {
    try {
      const shape = await loadWorkflowTestShape(opts.workflow, opts);
      allErrors.push(...checkTestsAgainstWorkflow(parsed, shape));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      allErrors.push({
        path: "(root)",
        message: `Failed to load workflow ${opts.workflow}: ${msg}`,
        keyword: "workflow_load_error",
        params: { workflow: opts.workflow },
      });
    }
  }

  const valid = schemaValid && allErrors.length === 0;

  if (opts.json) {
    const report: ValidateTestsReport = { file: filePath, valid, errors: allErrors };
    console.log(JSON.stringify(report, null, 2));
  } else if (valid) {
    console.log(`${filePath}: OK`);
  } else {
    console.error(`${filePath}: ${allErrors.length} validation error(s)`);
    for (const e of allErrors) {
      console.error(`  ${e.path}: ${e.message} [${e.keyword}]`);
    }
  }

  process.exitCode = valid ? 0 : 1;
}
