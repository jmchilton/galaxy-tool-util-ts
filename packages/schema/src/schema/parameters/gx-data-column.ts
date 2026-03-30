import * as S from "effect/Schema";
import type { DataColumnParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateDataColumnSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as DataColumnParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any;
  if (p.multiple) {
    // test_case_xml uses comma-separated string for multiple columns
    if (stateRep === "test_case_xml") {
      schema = S.String;
    } else {
      schema = S.Array(S.Int);
    }
  } else {
    schema = S.Int;
  }

  if (p.optional) {
    schema = S.NullOr(schema);
  }

  // Has a default if value is not null
  const hasDefault = p.value !== null;
  const requestRequiresValue = !p.optional && !hasDefault;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_data_column", generateDataColumnSchema);
