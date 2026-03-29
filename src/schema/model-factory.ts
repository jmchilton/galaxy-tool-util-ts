import * as S from "@effect/schema/Schema";
import type { ToolParameterBundleModel, ToolParameterModel } from "./bundle-types.js";
import type { StateRepresentation } from "./state-representations.js";
import { getParameterGenerator } from "./parameters/registry.js";
import type { DynamicSchemaInfo } from "./parameters/base.js";

/**
 * Build an Effect Schema for a tool parameter bundle at a given state representation.
 * Analogous to Python's create_field_model().
 *
 * Returns undefined if any parameter type lacks a registered generator
 * (caller should skip/handle gracefully).
 */
export function createFieldModel(
  bundle: ToolParameterBundleModel,
  stateRep: StateRepresentation,
): S.Schema.Any | undefined {
  const infos = buildSchemaInfos(bundle.parameters, stateRep);
  if (infos === undefined) return undefined;
  return assembleStruct(infos);
}

/**
 * Build DynamicSchemaInfo for each parameter. Returns undefined if any
 * parameter type is unregistered.
 */
function buildSchemaInfos(
  params: ToolParameterModel[],
  stateRep: StateRepresentation,
): DynamicSchemaInfo[] | undefined {
  const infos: DynamicSchemaInfo[] = [];
  for (const param of params) {
    const generator = getParameterGenerator(param.parameter_type);
    if (!generator) return undefined;
    infos.push(generator(param, stateRep));
  }
  return infos;
}

/**
 * Assemble DynamicSchemaInfo[] into an Effect Schema struct with extra="forbid" semantics.
 */
function assembleStruct(infos: DynamicSchemaInfo[]): S.Schema.Any {
  const fields: Record<string, S.Schema.Any | S.PropertySignature.Any> = {};

  for (const info of infos) {
    let field: S.Schema.Any | S.PropertySignature.Any;
    if (info.isOptional) {
      field = S.optional(info.schema);
    } else {
      field = info.schema;
    }

    // Apply key aliasing for _-prefixed params (safe_field_name escaping)
    if (info.alias) {
      field = (field as S.PropertySignature.Any).pipe(S.fromKey(info.alias));
    }

    fields[info.name] = field;
  }

  return S.Struct(fields as S.Struct.Fields);
}
