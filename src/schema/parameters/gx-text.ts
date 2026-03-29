import * as S from "@effect/schema/Schema";
import type { TextParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { safeFieldName, computeIsOptional, type DynamicSchemaInfo } from "./base.js";
import { registerParameterType } from "./registry.js";
import { applyValidators } from "../validators/registry.js";

function generateTextSchema(
  param: unknown,
  stateRep: StateRepresentation,
): DynamicSchemaInfo {
  const p = param as TextParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any = S.String;

  // Apply validators to the string before nullable wrapping
  schema = applyValidators(schema, p.validators);

  // gx_text is typically optional=true with null default
  if (p.optional) {
    schema = S.NullOr(schema);
  }

  // request_requires_value: !optional && value === null
  const requestRequiresValue = !p.optional && p.value === null;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_text", generateTextSchema);
