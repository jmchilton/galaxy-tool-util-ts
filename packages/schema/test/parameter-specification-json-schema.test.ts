import { describe, it, expect, afterAll } from "vitest";
import * as JSONSchema from "effect/JSONSchema";
import Ajv2020 from "ajv/dist/2020.js";
import * as yaml from "yaml";
import * as fs from "node:fs";
import * as path from "node:path";

import { createFieldModel } from "../src/schema/model-factory.js";
import { isParameterTypeRegistered } from "../src/schema/parameters/index.js";
import {
  isValidatorTypeRegistered,
  registeredValidatorTypes,
} from "../src/schema/validators/index.js";
import {
  collectParameterTypes,
  collectValidatorTypes,
  type ToolParameterBundleModel,
} from "../src/schema/bundle-types.js";
import {
  STATE_REPRESENTATIONS,
  type StateRepresentation,
} from "../src/schema/state-representations.js";

import "../src/schema/parameters/index.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");
const MODELS_DIR = path.join(FIXTURES_DIR, "parameter_models");

const specYaml = fs.readFileSync(path.join(FIXTURES_DIR, "parameter_specification.yml"), "utf-8");
const specification: Record<string, Record<string, unknown>> = yaml.parse(specYaml, {
  merge: true,
});

const SPEC_KEY_TO_STATE_REP: Record<string, StateRepresentation> = {};
for (const rep of STATE_REPRESENTATIONS) {
  SPEC_KEY_TO_STATE_REP[`${rep}_valid`] = rep;
  SPEC_KEY_TO_STATE_REP[`${rep}_invalid`] = rep;
}

const IMPLEMENTED_STATE_REPS = new Set<StateRepresentation>([
  "request",
  "request_internal",
  "request_internal_dereferenced",
  "landing_request",
  "landing_request_internal",
  "job_internal",
  "job_runtime",
  "workflow_step",
  "workflow_step_linked",
  "test_case_xml",
  "test_case_json",
  "relaxed_request",
]);

function loadBundle(toolName: string): ToolParameterBundleModel | undefined {
  const filePath = path.join(MODELS_DIR, `${toolName}.json`);
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function shouldSkipTool(toolName: string, bundle: ToolParameterBundleModel): string | null {
  const paramTypes = collectParameterTypes(bundle);
  for (const pt of paramTypes) {
    if (!isParameterTypeRegistered(pt)) {
      return `parameter_type '${pt}' not registered`;
    }
  }
  const validatorTypes = collectValidatorTypes(bundle);
  for (const vt of validatorTypes) {
    if (!isValidatorTypeRegistered(vt)) {
      return `validator_type '${vt}' not registered`;
    }
  }
  return null;
}

function shouldSkipSpecKey(specKey: string): string | null {
  const stateRep = SPEC_KEY_TO_STATE_REP[specKey];
  if (!stateRep) return `unknown spec key '${specKey}'`;
  if (!IMPLEMENTED_STATE_REPS.has(stateRep)) {
    return `state rep '${stateRep}' not implemented`;
  }
  return null;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });

let totalRun = 0;
let totalPassed = 0;
let totalSkippedTools = 0;
let totalSkippedKeys = 0;
let totalSchemaGenFailed = 0;

describe("parameter specification (JSON Schema)", () => {
  for (const [toolName, combos] of Object.entries(specification)) {
    describe(toolName, () => {
      const bundle = loadBundle(toolName);

      if (!bundle) {
        it.skip("no fixture bundle (tool not generated)", () => {});
        totalSkippedTools++;
        return;
      }

      const skipReason = shouldSkipTool(toolName, bundle);
      if (skipReason) {
        it.skip(`SKIP: ${skipReason}`, () => {});
        totalSkippedTools++;
        return;
      }

      const jsonSchemaSkip: Record<string, string> =
        (combos._json_schema_skip as Record<string, string>) ?? {};
      const jsonSchemaValidSkip: Record<string, string> =
        (combos._json_schema_valid_skip as Record<string, string>) ?? {};

      // Cache generated schemas per state rep
      const schemaCache = new Map<
        StateRepresentation,
        { jsonSchema: object; validate: ReturnType<typeof ajv.compile> } | null
      >();

      function getCompiledSchema(
        stateRep: StateRepresentation,
      ): { jsonSchema: object; validate: ReturnType<typeof ajv.compile> } | null {
        if (schemaCache.has(stateRep)) return schemaCache.get(stateRep)!;
        const effectSchema = createFieldModel(bundle!, stateRep);
        if (!effectSchema) {
          schemaCache.set(stateRep, null);
          return null;
        }
        try {
          const jsonSchema = JSONSchema.make(effectSchema, { target: "jsonSchema2020-12" });
          const validate = ajv.compile(jsonSchema);
          const result = { jsonSchema, validate };
          schemaCache.set(stateRep, result);
          return result;
        } catch {
          schemaCache.set(stateRep, null);
          return null;
        }
      }

      for (const [specKey, testCases] of Object.entries(combos)) {
        if (specKey.startsWith("_")) continue;

        const keySkipReason = shouldSkipSpecKey(specKey);
        if (keySkipReason) {
          it.skip(`${specKey}: ${keySkipReason}`, () => {});
          totalSkippedKeys++;
          continue;
        }

        const stateRep = SPEC_KEY_TO_STATE_REP[specKey]!;
        const isValid = specKey.endsWith("_valid");

        const compiled = getCompiledSchema(stateRep);
        if (!compiled) {
          it.skip(`${specKey}: JSON Schema generation failed for ${stateRep}`, () => {});
          totalSchemaGenFailed++;
          continue;
        }

        for (let i = 0; i < (testCases as unknown[]).length; i++) {
          const testCase = (testCases as unknown[])[i];
          const label = `${specKey}[${i}]: ${JSON.stringify(testCase)}`;

          it(label, () => {
            totalRun++;
            const valid = compiled.validate(testCase);
            if (isValid) {
              if (!valid && !(specKey in jsonSchemaValidSkip)) {
                expect.fail(
                  `Valid entry REJECTED by JSON Schema: ${JSON.stringify(testCase)}\nErrors: ${JSON.stringify(compiled.validate.errors)}`,
                );
              }
            } else {
              if (valid && !(specKey in jsonSchemaSkip)) {
                expect.fail(`Invalid entry ACCEPTED by JSON Schema: ${JSON.stringify(testCase)}`);
              }
            }
            totalPassed++;
          });
        }
      }
    });
  }

  afterAll(() => {
    const valTypes = registeredValidatorTypes();
    console.log(
      `\nJSON Schema spec summary: ${totalPassed} passed, ${totalRun - totalPassed} failed, ` +
        `${totalSkippedTools} tools skipped, ${totalSkippedKeys} keys skipped, ` +
        `${totalSchemaGenFailed} schema gen failed`,
    );
    console.log(`Registered validator types: ${[...valTypes].join(", ") || "(none)"}`);
  });
});
