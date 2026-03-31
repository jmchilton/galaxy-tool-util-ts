import * as S from "effect/Schema";
import type { ColorParameterModel } from "../bundle-types.js";
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

function generateColorSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as ColorParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any;
  let connectedValueHandled = false;

  if (allowsConnectedOrRuntimeValue(stateRep)) {
    // Native: color hex string or ConnectedValue/RuntimeValue
    const colorSchema: S.Schema.Any = S.String.pipe(S.pattern(/^#[0-9a-fA-F]{6}$/));
    schema = S.Union(colorSchema, ConnectedOrRuntimeValueSchema);
    connectedValueHandled = true;
  } else {
    // Color is a hex string like #aabbcc — 7-char pattern
    schema = S.String.pipe(S.pattern(/^#[0-9a-fA-F]{6}$/));
  }

  // gx_color always has a default value
  const isOptional = computeIsOptional(stateRep, false);

  return { name, alias, schema, isOptional, connectedValueHandled };
}

registerParameterType("gx_color", generateColorSchema);
