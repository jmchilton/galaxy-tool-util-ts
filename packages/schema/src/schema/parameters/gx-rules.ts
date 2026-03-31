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
 */
function isValidMapping(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return typeof m.type === "string" && Array.isArray(m.columns) && m.columns.every((c) => Number.isInteger(c));
}

/**
 * Mirrors Python RulesModel(BaseModel) with extra="allow":
 *   rules: List[Dict[str, Any]], mapping: List[RulesMapping]
 * Uses a filter to allow extra properties (Python extra="allow").
 */
const RulesModelSchema: S.Schema.Any = S.Record({ key: S.String, value: S.Unknown }).pipe(
  S.filter((obj: { readonly [x: string]: unknown }) => {
    const o = obj as Record<string, unknown>;
    if (!Array.isArray(o.rules)) return "rules must be an array";
    if (!Array.isArray(o.mapping)) return "mapping must be an array";
    for (const m of o.mapping) {
      if (!isValidMapping(m)) return "each mapping must have type:string and columns:int[]";
    }
    return undefined;
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
