import * as S from "@effect/schema/Schema";
import type { DataParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { usesStringIds, allowsBatching } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateDataSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as DataParameterModel;
  const { name, alias } = safeFieldName(p.name);

  const idSchema: S.Schema.Any = usesStringIds(stateRep) ? S.String : S.Int;

  // Direct sources
  const hdaSource = S.Struct({ src: S.Literal("hda"), id: idSchema });
  const urlSource = S.Struct({ src: S.Literal("url"), url: S.String, ext: S.String });

  // Batch: hdca/dce with optional map_over_type
  const hdcaBatchVal = S.Struct({
    src: S.Literal("hdca"),
    id: idSchema,
    map_over_type: S.optional(S.NullOr(S.String)),
  });
  const dceBatchVal = S.Struct({
    src: S.Literal("dce"),
    id: idSchema,
    map_over_type: S.optional(S.NullOr(S.String)),
  });
  const batchSource = S.Struct({
    __class__: S.Literal("Batch"),
    values: S.Array(S.Union(hdcaBatchVal, dceBatchVal)),
  });

  let schema: S.Schema.Any;

  if (p.multiple) {
    // Multiple: single src obj OR array of srcs; hdca allowed directly
    const hdcaDirect = S.Struct({ src: S.Literal("hdca"), id: idSchema });
    const singleSrc = S.Union(hdaSource, hdcaDirect, urlSource);
    const parts: S.Schema.Any[] = [singleSrc, S.Array(singleSrc)];
    if (allowsBatching(stateRep)) {
      parts.push(batchSource);
    }
    schema = S.Union(...parts);
  } else {
    // Single: hda direct + url + batch
    const parts: S.Schema.Any[] = [hdaSource, urlSource];
    if (allowsBatching(stateRep)) {
      parts.push(batchSource);
    }
    schema = S.Union(...parts);
  }

  if (p.optional) {
    schema = S.NullOr(schema);
  }

  // Data parameters always require a value unless optional
  const requestRequiresValue = !p.optional;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_data", generateDataSchema);
