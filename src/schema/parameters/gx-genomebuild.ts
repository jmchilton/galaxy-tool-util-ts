import * as S from "@effect/schema/Schema";
import type { GenomeBuildParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { safeFieldName, computeIsOptional, type DynamicSchemaInfo, type GeneratorContext } from "./base.js";
import { registerParameterType } from "./registry.js";

function generateGenomeBuildSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as GenomeBuildParameterModel;
  const { name, alias } = safeFieldName(p.name);

  // Options are dynamic/server-provided — accept any string
  let valueSchema: S.Schema.Any = S.String;

  let schema: S.Schema.Any;
  if (p.multiple) {
    schema = S.NullOr(S.Array(valueSchema));
  } else if (p.optional) {
    schema = S.NullOr(valueSchema);
  } else {
    schema = valueSchema;
  }

  const isOptional = computeIsOptional(stateRep, false);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_genomebuild", generateGenomeBuildSchema);
