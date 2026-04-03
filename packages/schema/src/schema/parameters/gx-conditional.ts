import * as S from "effect/Schema";
import type { ConditionalParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { requiresAllFields, allowsConnectedOrRuntimeValue } from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

/** Check if a conditional's test_parameter is boolean-typed */
function isBooleanTest(p: ConditionalParameterModel): boolean {
  return p.test_parameter.parameter_type === "gx_boolean";
}

function generateConditionalSchema(
  param: unknown,
  stateRep: StateRepresentation,
  ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as ConditionalParameterModel;
  const { name, alias } = safeFieldName(p.name);
  const testParam = safeFieldName(p.test_parameter.name);
  const isBoolean = isBooleanTest(p);
  const isNative = allowsConnectedOrRuntimeValue(stateRep);

  const branchSchemas: S.Schema.Any[] = [];

  // Boolean conditionals with only one branch: synthesize empty branch for
  // missing discriminator. is_default_when=false is safe — the synthesized
  // branch has no child params, so requiring the test param value is correct.
  const definedDiscriminators = new Set(p.whens.map((w) => w.discriminator));
  let whens = p.whens;
  if (isBoolean && p.whens.length === 1) {
    const missing = !definedDiscriminators.has(true) ? true : false;
    whens = [...p.whens, { discriminator: missing, parameters: [], is_default_when: false }];
  }

  for (const when of whens) {
    const childInfos = ctx.buildChildSchemaInfos(when.parameters, stateRep);
    if (!childInfos) {
      throw new Error(`Failed to build child schemas for conditional branch ${when.discriminator}`);
    }

    // test_parameter is optional only in the default branch for non-requiresAllFields states
    const testParamOptional = !requiresAllFields(stateRep) && when.is_default_when;

    // For native + boolean test, discriminator accepts both bool and string form
    let testSchema: S.Schema.Any;
    if (isBoolean && isNative) {
      const strForm = String(when.discriminator).toLowerCase();
      testSchema = S.Union(S.Literal(when.discriminator as any), S.Literal(strForm as any));
    } else {
      testSchema = S.Literal(when.discriminator as any);
    }

    const testParamInfo: DynamicSchemaInfo = {
      name: testParam.name,
      alias: testParam.alias,
      schema: testSchema,
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
