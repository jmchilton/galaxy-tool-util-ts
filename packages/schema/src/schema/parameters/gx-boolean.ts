import * as S from "effect/Schema";
import type { BooleanParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { allowsConnectedOrRuntimeValue } from "../state-representations.js";
import { ConnectedOrRuntimeValueSchema } from "../model-factory.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateBooleanSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as BooleanParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any;
  let connectedValueHandled = false;

  if (allowsConnectedOrRuntimeValue(stateRep)) {
    // Native booleans can be actual bools or strings "true"/"false"/"True"/"False"
    let nativeBool: S.Schema.Any = S.Union(S.Boolean, S.Literal("true", "false", "True", "False"));
    if (p.optional) {
      nativeBool = S.NullOr(nativeBool);
    }
    schema = S.Union(nativeBool, ConnectedOrRuntimeValueSchema);
    connectedValueHandled = true;
  } else {
    // Strict boolean — rejects strings like "true", null, objects
    schema = S.Boolean;
  }

  // gx_boolean always has a default value, so never request-requires
  const isOptional = computeIsOptional(stateRep, false);

  return { name, alias, schema, isOptional, connectedValueHandled };
}

registerParameterType("gx_boolean", generateBooleanSchema);
