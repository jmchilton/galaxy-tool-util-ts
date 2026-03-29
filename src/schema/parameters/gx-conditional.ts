import * as S from "@effect/schema/Schema";
import type { ConditionalParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { requiresAllFields } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateConditionalSchema(
  param: unknown,
  stateRep: StateRepresentation,
  ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as ConditionalParameterModel;
  const { name, alias } = safeFieldName(p.name);
  const testParam = safeFieldName(p.test_parameter.name);

  const branchSchemas: S.Schema.Any[] = [];

  for (const when of p.whens) {
    const childInfos = ctx.buildChildSchemaInfos(when.parameters, stateRep);
    if (!childInfos) {
      throw new Error(
        `Failed to build child schemas for conditional branch ${when.discriminator}`,
      );
    }

    // test_parameter is optional only in the default branch for non-requiresAllFields states
    const testParamOptional = !requiresAllFields(stateRep) && when.is_default_when;

    const testParamInfo: DynamicSchemaInfo = {
      name: testParam.name,
      alias: testParam.alias,
      schema: S.Literal(when.discriminator as any),
      isOptional: testParamOptional,
    };

    const branchStruct = ctx.assembleStruct([testParamInfo, ...childInfos]);
    branchSchemas.push(branchStruct);
  }

  const schema: S.Schema.Any =
    branchSchemas.length === 1 ? branchSchemas[0] : S.Union(...branchSchemas);

  // Conditionals always have defaults (via test_parameter default), never requestRequiresValue
  const isOptional = computeIsOptional(stateRep, false);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_conditional", generateConditionalSchema);
