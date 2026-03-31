import * as S from "effect/Schema";
import type { HiddenParameterModel } from "../bundle-types.js";
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
import { applyValidators } from "../validators/registry.js";

function generateHiddenSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as HiddenParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any = S.String;
  schema = applyValidators(schema, p.validators);
  let connectedValueHandled = false;

  if (allowsConnectedOrRuntimeValue(stateRep)) {
    schema = S.Union(schema, ConnectedOrRuntimeValueSchema);
    connectedValueHandled = true;
    // Force optional for non-optional hidden params in native
    if (!p.optional) {
      schema = S.NullOr(schema);
    }
  } else if (p.optional) {
    schema = S.NullOr(schema);
  }

  // Hidden params with a value set don't require user input
  let requestRequiresValue = !p.optional && p.value === null;
  if (allowsConnectedOrRuntimeValue(stateRep) && !p.optional) {
    requestRequiresValue = false;
  }
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional, connectedValueHandled };
}

registerParameterType("gx_hidden", generateHiddenSchema);
