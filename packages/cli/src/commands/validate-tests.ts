/**
 * ``gxwf validate-tests`` — validate a workflow-test file (``*-tests.yml`` /
 * ``*.gxwf-tests.yml``) against the JSON Schema synced from Galaxy's
 * ``galaxy.tool_util_models.Tests`` Pydantic model.
 *
 * With ``--workflow <path>`` also cross-checks inputs/outputs against the
 * referenced workflow: unknown job keys, missing required inputs, type
 * mismatches, input/output collection shape, unknown output assertions, and
 * (as warnings) input filetype vs declared format.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { validateTestsFile, type TestFormatDiagnostic } from "@galaxy-tool-util/schema";

import { crossCheckTests, partitionDiagnostics } from "./tests-cross-check.js";

export interface ValidateTestsOptions {
  json?: boolean;
  workflow?: string;
  cacheDir?: string;
}

export interface ValidateTestsReport {
  file: string;
  valid: boolean;
  errors: TestFormatDiagnostic[];
  warnings: TestFormatDiagnostic[];
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
        warnings: [],
      };
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error(`${filePath}: YAML parse error: ${msg}`);
    }
    process.exitCode = 2;
    return;
  }

  const { valid: schemaValid, errors: schemaErrors } = validateTestsFile(parsed);
  const diagnostics = [...schemaErrors];

  if (opts.workflow) {
    try {
      diagnostics.push(...(await crossCheckTests(parsed, opts.workflow, opts)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        path: "(root)",
        message: `Failed to load workflow ${opts.workflow}: ${msg}`,
        keyword: "workflow_load_error",
        params: { workflow: opts.workflow },
      });
    }
  }

  const { errors, warnings } = partitionDiagnostics(diagnostics);
  const valid = schemaValid && errors.length === 0;

  if (opts.json) {
    const report: ValidateTestsReport = { file: filePath, valid, errors, warnings };
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (valid) {
      console.log(`${filePath}: OK`);
    } else {
      console.error(`${filePath}: ${errors.length} validation error(s)`);
      for (const e of errors) {
        console.error(`  ${e.path}: ${e.message} [${e.keyword}]`);
      }
    }
    for (const w of warnings) {
      console.error(`  warning ${w.path}: ${w.message} [${w.keyword}]`);
    }
  }

  process.exitCode = valid ? 0 : 1;
}
