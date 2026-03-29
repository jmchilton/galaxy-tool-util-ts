import * as S from "@effect/schema/Schema";
import type { HiddenParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { safeFieldName, computeIsOptional, type DynamicSchemaInfo } from "./base.js";
import { registerParameterType } from "./registry.js";
import { applyValidators } from "../validators/registry.js";

function generateHiddenSchema(
  param: unknown,
  stateRep: StateRepresentation,
): DynamicSchemaInfo {
  const p = param as HiddenParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any = S.String;
  schema = applyValidators(schema, p.validators);

  if (p.optional) {
    schema = S.NullOr(schema);
  }

  // Hidden params with a value set don't require user input
  const requestRequiresValue = !p.optional && p.value === null;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_hidden", generateHiddenSchema);
