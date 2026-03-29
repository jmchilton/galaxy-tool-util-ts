import type { SectionParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateSectionSchema(
  param: unknown,
  stateRep: StateRepresentation,
  ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as SectionParameterModel;
  const { name, alias } = safeFieldName(p.name);

  const childInfos = ctx.buildChildSchemaInfos(p.parameters, stateRep);
  if (!childInfos) {
    throw new Error(`Failed to build child schemas for section '${p.name}'`);
  }

  const schema = ctx.assembleStruct(childInfos);

  // Section is required in request if any child is required
  const anyChildRequired = childInfos.some((info) => !info.isOptional);
  const isOptional = computeIsOptional(stateRep, anyChildRequired);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_section", generateSectionSchema);
