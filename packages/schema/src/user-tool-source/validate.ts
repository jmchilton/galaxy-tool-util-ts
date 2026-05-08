/**
 * Validate user-defined Galaxy tool source documents against the JSON Schema
 * synced from Galaxy's ``galaxy.tool_util_models.DynamicToolSources``
 * (``UserToolSource | YamlToolSource``). Source of truth is Python; the
 * schema lives at ``src/user-tool-source/schema.json`` and is refreshed via
 * ``make sync-user-tool-source-schema``.
 *
 * JSON Schema validation only covers structural rules (``additionalProperties:
 * false``, ``class``/``type`` discriminators, the ``id`` pattern, the ``name``
 * ``minLength``, etc). Semantic checks added in galaxyproject/galaxy#22615 —
 * undeclared ``inputs.<name>`` references, output discovery requirements,
 * citation DOI/BibTeX shape, blank-string rejection — live in
 * ``./semantic.ts`` because Pydantic ``model_validator`` rules don't render
 * into JSON Schema.
 */

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";
import { userToolSourceSchema } from "./schema.generated.js";
import { runSemanticChecks } from "./semantic.js";

const Ajv2020 = Ajv2020Import as unknown as typeof Ajv2020Import.default;
const addFormats = addFormatsImport as unknown as typeof addFormatsImport.default;

export interface UserToolSourceDiagnostic {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
}

export interface ValidateUserToolSourceOptions {
  /** Skip semantic (model_validator) checks; structural only. */
  schemaOnly?: boolean;
}

let _validator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (!_validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    _validator = ajv.compile(userToolSourceSchema as object) as ValidateFunction;
  }
  return _validator;
}

function toDiagnostic(err: ErrorObject): UserToolSourceDiagnostic {
  return {
    path: err.instancePath === "" ? "(root)" : err.instancePath,
    message: err.message ?? "validation error",
    keyword: err.keyword,
    params: (err.params ?? {}) as Record<string, unknown>,
  };
}

/**
 * Validate a parsed user-tool-source document. Returns structural errors plus,
 * unless ``schemaOnly`` is set, the semantic checks that mirror
 * ``UserToolSource``'s pydantic ``model_validator`` rules.
 */
export function validateUserToolSource(
  parsed: unknown,
  opts: ValidateUserToolSourceOptions = {},
): {
  valid: boolean;
  errors: UserToolSourceDiagnostic[];
} {
  const validate = getValidator();
  const structuralOk = validate(parsed) as boolean;
  const errors = structuralOk ? [] : (validate.errors ?? []).map(toDiagnostic);

  if (!opts.schemaOnly && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    errors.push(...runSemanticChecks(parsed as Record<string, unknown>));
  }

  return { valid: errors.length === 0, errors };
}

export { userToolSourceSchema };
