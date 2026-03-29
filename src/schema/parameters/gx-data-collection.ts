import * as S from "@effect/schema/Schema";
import type { DataCollectionParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { usesStringIds } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateDataCollectionSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as DataCollectionParameterModel;
  const { name, alias } = safeFieldName(p.name);

  const idSchema: S.Schema.Any = usesStringIds(stateRep) ? S.String : S.Int;

  // HDCA reference
  const hdcaSource = S.Struct({ src: S.Literal("hdca"), id: idSchema });

  // Inline collection definition
  const inlineCollection = S.Struct({
    class: S.Literal("Collection"),
    collection_type: S.String,
    elements: S.Array(S.Unknown),
  });

  let schema: S.Schema.Any = S.Union(hdcaSource, inlineCollection);

  if (p.optional) {
    schema = S.NullOr(schema);
  }

  // Data collection always requires a value unless optional
  const requestRequiresValue = !p.optional;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_data_collection", generateDataCollectionSchema);
