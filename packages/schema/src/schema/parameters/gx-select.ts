import * as S from "effect/Schema";
import type { SelectParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { allowsConnectedValue } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateSelectSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as SelectParameterModel;
  const { name, alias } = safeFieldName(p.name);

  // Build literal union from static options
  let valueSchema: S.Schema.Any;
  if (p.options.length > 0) {
    const literals = p.options.map((o) => S.Literal(o.value));
    valueSchema = S.Union(...literals);
  } else {
    // Dynamic options — accept any string
    valueSchema = S.String;
  }

  let schema: S.Schema.Any;
  let connectedValueHandled = false;

  if (p.multiple) {
    // multiple: array of valid values, or null
    let itemSchema = valueSchema;
    // For workflow_step_linked, ConnectedValue is an array item alternative
    if (allowsConnectedValue(stateRep)) {
      const cv = S.Struct({ __class__: S.Literal("ConnectedValue") });
      itemSchema = S.Union(valueSchema, cv);
      connectedValueHandled = true;
    }
    if (stateRep === "test_case_xml") {
      // test_case_xml also accepts comma-separated string
      schema = S.Union(S.NullOr(S.Array(valueSchema)), S.String);
    } else {
      schema = S.NullOr(S.Array(itemSchema));
    }
  } else if (p.optional) {
    schema = S.NullOr(valueSchema);
  } else {
    schema = valueSchema;
  }

  // select always has a default (first option or explicit), so not request-requires
  const isOptional = computeIsOptional(stateRep, false);

  return { name, alias, schema, isOptional, connectedValueHandled };
}

registerParameterType("gx_select", generateSelectSchema);
