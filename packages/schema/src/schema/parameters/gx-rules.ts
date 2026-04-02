import * as S from "effect/Schema";
import type { RulesParameterModel } from "../bundle-types.js";
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

/**
 * Mirrors Python RulesMapping(BaseModel) with extra="allow":
 *   type: str, columns: List[StrictInt]
 * Runtime filter validates required fields; JSON Schema annotation provides
 * structural validation. Extra properties allowed via onExcessProperty: "ignore".
 */
const _RulesMappingSchema = S.Record({ key: S.String, value: S.Unknown }).pipe(
  S.filter((obj: { readonly [x: string]: unknown }) => {
    const m = obj as Record<string, unknown>;
    if (typeof m.type !== "string") return "type must be a string";
    if (!Array.isArray(m.columns) || !m.columns.every((c) => Number.isInteger(c))) {
      return "columns must be an integer array";
    }
    return undefined;
  }, {
    jsonSchema: {
      type: "object",
      required: ["type", "columns"],
      properties: {
        type: { type: "string" },
        columns: { type: "array", items: { type: "integer" } },
      },
    },
  }),
);

/**
 * Mirrors Python RulesModel(BaseModel) with extra="allow":
 *   rules: List[Dict[str, Any]], mapping: List[RulesMapping]
 * Runtime filter validates structure; JSON Schema annotation provides
 * structural validation. Extra properties allowed.
 */
const RulesModelSchema: S.Schema.Any = S.Record({ key: S.String, value: S.Unknown }).pipe(
  S.filter((obj: { readonly [x: string]: unknown }) => {
    const o = obj as Record<string, unknown>;
    if (!Array.isArray(o.rules)) return "rules must be an array";
    if (!Array.isArray(o.mapping)) return "mapping must be an array";
    for (const m of o.mapping) {
      if (!m || typeof m !== "object") return "each mapping must be an object";
      const mapping = m as Record<string, unknown>;
      if (typeof mapping.type !== "string") return "each mapping must have type:string";
      if (!Array.isArray(mapping.columns) || !mapping.columns.every((c) => Number.isInteger(c as number))) {
        return "each mapping must have columns:int[]";
      }
    }
    return undefined;
  }, {
    jsonSchema: {
      type: "object",
      required: ["rules", "mapping"],
      properties: {
        rules: {
          type: "array",
          items: { type: "object" },
        },
        mapping: {
          type: "array",
          items: {
            type: "object",
            required: ["type", "columns"],
            properties: {
              type: { type: "string" },
              columns: { type: "array", items: { type: "integer" } },
            },
          },
        },
      },
    },
  }),
);

function generateRulesSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as RulesParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any = RulesModelSchema;
  let connectedValueHandled = false;

  if (allowsConnectedOrRuntimeValue(stateRep)) {
    schema = S.Union(schema, ConnectedOrRuntimeValueSchema);
    connectedValueHandled = true;
  }

  const requestRequiresValue = true;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional, connectedValueHandled };
}

registerParameterType("gx_rules", generateRulesSchema);
