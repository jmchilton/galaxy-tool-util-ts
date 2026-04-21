/**
 * Validate workflow test files against the JSON Schema synced from Galaxy's
 * ``galaxy.tool_util_models.Tests`` Pydantic model. Source of truth is Python;
 * the schema lives at ``src/test-format/tests.schema.json`` and is refreshed via
 * ``make sync-test-format-schema``.
 */

// ajv/ajv-formats are CJS packages whose TypeScript types under Node16 module
// resolution resolve the default import as a namespace rather than the real
// class/function. Node's ESM-to-CJS interop still hands us the correct runtime
// value (the `default` key of `module.exports`) — the cast realigns the type.
import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";
import { testsSchema } from "./tests.schema.generated.js";

const Ajv2020 = Ajv2020Import as unknown as typeof Ajv2020Import.default;
const addFormats = addFormatsImport as unknown as typeof addFormatsImport.default;

export interface TestFormatDiagnostic {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
}

let _validator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (!_validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    _validator = ajv.compile(testsSchema as object) as ValidateFunction;
  }
  return _validator;
}

function toDiagnostic(err: ErrorObject): TestFormatDiagnostic {
  return {
    path: err.instancePath === "" ? "(root)" : err.instancePath,
    message: err.message ?? "validation error",
    keyword: err.keyword,
    params: (err.params ?? {}) as Record<string, unknown>,
  };
}

/** Validate a parsed tests document (list of test entries). */
export function validateTestsFile(parsed: unknown): {
  valid: boolean;
  errors: TestFormatDiagnostic[];
} {
  const validate = getValidator();
  const valid = validate(parsed) as boolean;
  const errors = valid ? [] : (validate.errors ?? []).map(toDiagnostic);
  return { valid, errors };
}

export { testsSchema };
