import * as S from "effect/Schema";
import type { FloatParameterModel, InRangeValidatorModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";
import { applyValidators } from "../validators/registry.js";

function generateFloatSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as FloatParameterModel;
  const { name, alias } = safeFieldName(p.name);

  // Accept any finite number (int or float) — mirrors StrictFloat | StrictInt
  let schema: S.Schema.Any = S.Number.pipe(S.finite());

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

  if (p.optional) {
    schema = S.NullOr(schema);
  }

  const requestRequiresValue = !p.optional && p.value === null;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_float", generateFloatSchema);
