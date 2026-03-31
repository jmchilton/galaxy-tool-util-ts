import * as S from "effect/Schema";
import type { IntegerParameterModel, InRangeValidatorModel } from "../bundle-types.js";
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
import { applyValidators } from "../validators/registry.js";

function generateIntegerSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as IntegerParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any;
  let connectedValueHandled = false;

  if (allowsConnectedOrRuntimeValue(stateRep)) {
    // Native: accept int or string-encoded int, skip range validators
    schema = NativeInt;
    if (p.optional) {
      schema = S.NullOr(schema);
    }
    schema = S.Union(schema, ConnectedOrRuntimeValueSchema);
    connectedValueHandled = true;
  } else {
    // Base type: strict integer (rejects strings, floats)
    schema = S.Int;

    // Collect validators: explicit + implicit from min/max
    const validators = [...p.validators];
    if (p.min !== null || p.max !== null) {
      validators.push({
        type: "in_range" as const,
        min: p.min,
        max: p.max,
        exclude_min: false,
        exclude_max: false,
        negate: false,
      } satisfies InRangeValidatorModel);
    }
    schema = applyValidators(schema, validators);

    // Optional wrapping: if parameter is optional, allow null
    if (p.optional) {
      schema = S.NullOr(schema);
    }
  }

  const requestRequiresValue = !p.optional && p.value === null;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional, connectedValueHandled };
}

registerParameterType("gx_integer", generateIntegerSchema);
