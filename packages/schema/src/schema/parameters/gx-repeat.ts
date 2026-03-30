import * as S from "effect/Schema";
import type { RepeatParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { allOptional } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateRepeatSchema(
  param: unknown,
  stateRep: StateRepresentation,
  ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as RepeatParameterModel;
  const { name, alias } = safeFieldName(p.name);

  const childInfos = ctx.buildChildSchemaInfos(p.parameters, stateRep);
  if (!childInfos) {
    throw new Error(`Failed to build child schemas for repeat '${p.name}'`);
  }

  const childStruct = ctx.assembleStruct(childInfos);
  let schema: S.Schema.Any = S.Array(childStruct);

  // Apply min/max array length constraints (skip for all-optional state reps like landing_request)
  if (!allOptional(stateRep)) {
    if (p.min !== null && p.min > 0) {
      schema = (schema as S.Schema<readonly unknown[]>).pipe(S.minItems(p.min)) as S.Schema.Any;
    }
    if (p.max !== null) {
      schema = (schema as S.Schema<readonly unknown[]>).pipe(S.maxItems(p.max)) as S.Schema.Any;
    }
  }

  // Repeat is required in request only if children require values AND min > 0
  const anyChildRequired = childInfos.some((info) => !info.isOptional);
  const requestRequiresValue = anyChildRequired && p.min !== null && p.min > 0;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_repeat", generateRepeatSchema);
