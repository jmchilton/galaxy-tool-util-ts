import * as S from "effect/Schema";
import type { DataColumnParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { allowsConnectedOrRuntimeValue } from "../state-representations.js";
import { ConnectedOrRuntimeValueSchema } from "../model-factory.js";
import {
  safeFieldName,
  computeIsOptional,
  NativeInt,
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
  let connectedValueHandled = false;

  if (allowsConnectedOrRuntimeValue(stateRep)) {
    // Native: NativeInt (int or string-int), multiple allows list or comma-delimited string
    if (p.multiple) {
      schema = S.Union(S.Array(NativeInt), S.String);
    } else {
      schema = NativeInt;
    }
    if (p.optional) {
      schema = S.NullOr(schema);
    }
    schema = S.Union(schema, ConnectedOrRuntimeValueSchema);
    connectedValueHandled = true;
    // data_column in native always optional (mirrors workflow_step_linked behavior)
    return { name, alias, schema, isOptional: true, connectedValueHandled };
  }

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

  return { name, alias, schema, isOptional, connectedValueHandled };
}

registerParameterType("gx_data_column", generateDataColumnSchema);
