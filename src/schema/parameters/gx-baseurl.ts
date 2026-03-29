import * as S from "@effect/schema/Schema";
import type { BaseUrlParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { safeFieldName, computeIsOptional, type DynamicSchemaInfo } from "./base.js";
import { registerParameterType } from "./registry.js";

function generateBaseUrlSchema(
  param: unknown,
  stateRep: StateRepresentation,
): DynamicSchemaInfo {
  const p = param as BaseUrlParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any = S.String;

  if (p.optional) {
    schema = S.NullOr(schema);
  }

  const requestRequiresValue = !p.optional && p.value === null;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_baseurl", generateBaseUrlSchema);
