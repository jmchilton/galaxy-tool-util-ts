import * as S from "@effect/schema/Schema";
import type { SelectParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { safeFieldName, computeIsOptional, type DynamicSchemaInfo } from "./base.js";
import { registerParameterType } from "./registry.js";

function generateSelectSchema(
  param: unknown,
  stateRep: StateRepresentation,
): DynamicSchemaInfo {
  const p = param as SelectParameterModel;
  const { name, alias } = safeFieldName(p.name);

  // Build literal union from static options
  let valueSchema: S.Schema.Any;
  if (p.options.length > 0) {
    const literals = p.options.map((o) => S.Literal(o.value));
    valueSchema = S.Union(...literals);
  } else {
    // Dynamic options — accept any string
    valueSchema = S.String;
  }

  let schema: S.Schema.Any;
  if (p.multiple) {
    // multiple: array of valid values, or null
    schema = S.NullOr(S.Array(valueSchema));
  } else if (p.optional) {
    schema = S.NullOr(valueSchema);
  } else {
    schema = valueSchema;
  }

  // select always has a default (first option or explicit), so not request-requires
  const isOptional = computeIsOptional(stateRep, false);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_select", generateSelectSchema);
