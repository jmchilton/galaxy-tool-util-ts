import * as S from "effect/Schema";
import type { GroupTagParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateGroupTagSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as GroupTagParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any;
  if (p.multiple) {
    schema = S.Array(S.String);
  } else {
    schema = S.String;
  }

  if (p.optional) {
    schema = S.NullOr(schema);
  }

  // Group tags always require a value unless optional
  const requestRequiresValue = !p.optional;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_group_tag", generateGroupTagSchema);
