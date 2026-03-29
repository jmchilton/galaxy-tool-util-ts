import * as S from "@effect/schema/Schema";
import type { BooleanParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { safeFieldName, computeIsOptional, type DynamicSchemaInfo } from "./base.js";
import { registerParameterType } from "./registry.js";

function generateBooleanSchema(
  param: unknown,
  stateRep: StateRepresentation,
): DynamicSchemaInfo {
  const p = param as BooleanParameterModel;
  const { name, alias } = safeFieldName(p.name);

  // Strict boolean — rejects strings like "true", null, objects
  const schema: S.Schema.Any = S.Boolean;

  // gx_boolean always has a default value, so never request-requires
  const isOptional = computeIsOptional(stateRep, false);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_boolean", generateBooleanSchema);
