import * as S from "@effect/schema/Schema";
import type { DrillDownParameterModel, DrillDownOption } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function collectValues(
  options: DrillDownOption[],
  leafOnly: boolean,
): string[] {
  const values: string[] = [];
  for (const opt of options) {
    const isLeaf = opt.options.length === 0;
    if (!leafOnly || isLeaf) {
      values.push(opt.value);
    }
    values.push(...collectValues(opt.options, leafOnly));
  }
  return values;
}

function generateDrillDownSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as DrillDownParameterModel;
  const { name, alias } = safeFieldName(p.name);

  // "exact" mode: all nodes selectable. "recurse" single: leaf-only. "recurse" multiple: all nodes.
  const leafOnly = p.hierarchy === "recurse" && !p.multiple;
  const validValues = collectValues(p.options, leafOnly);

  let valueSchema: S.Schema.Any;
  if (validValues.length > 0) {
    valueSchema = S.Union(...validValues.map((v) => S.Literal(v)));
  } else {
    valueSchema = S.String;
  }

  let schema: S.Schema.Any;
  if (p.multiple) {
    schema = S.Array(valueSchema);
  } else {
    schema = valueSchema;
  }

  // Drill-down has no implicit default — always requires a value
  const isOptional = computeIsOptional(stateRep, true);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_drill_down", generateDrillDownSchema);
