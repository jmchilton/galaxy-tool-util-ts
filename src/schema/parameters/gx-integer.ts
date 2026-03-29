import * as S from "@effect/schema/Schema";
import type { IntegerParameterModel, InRangeValidatorModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { safeFieldName, computeIsOptional, type DynamicSchemaInfo, type GeneratorContext } from "./base.js";
import { registerParameterType } from "./registry.js";
import { applyValidators } from "../validators/registry.js";

function generateIntegerSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as IntegerParameterModel;
  const { name, alias } = safeFieldName(p.name);

  // Base type: strict integer (rejects strings, floats)
  let schema: S.Schema.Any = S.Int;

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

  const requestRequiresValue = !p.optional && p.value === null;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_integer", generateIntegerSchema);
