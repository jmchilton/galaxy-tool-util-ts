import { describe, it, expect, afterAll } from "vitest";
import * as S from "@effect/schema/Schema";
import { Either } from "effect";
import * as yaml from "yaml";
import * as fs from "node:fs";
import * as path from "node:path";

import { createFieldModel } from "../src/schema/model-factory.js";
import {
  isParameterTypeRegistered,
  registeredParameterTypes,
} from "../src/schema/parameters/index.js";
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

// Parameter registrations happen via side-effect imports in src/schema/parameters/index.ts
import "../src/schema/parameters/index.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");
const MODELS_DIR = path.join(FIXTURES_DIR, "parameter_models");

// Load the specification YAML
const specYaml = fs.readFileSync(path.join(FIXTURES_DIR, "parameter_specification.yml"), "utf-8");
const specification: Record<string, Record<string, unknown[]>> = yaml.parse(specYaml, {
  merge: true,
});

// Map spec keys to state representations
const SPEC_KEY_TO_STATE_REP: Record<string, StateRepresentation> = {};
for (const rep of STATE_REPRESENTATIONS) {
  SPEC_KEY_TO_STATE_REP[`${rep}_valid`] = rep;
  SPEC_KEY_TO_STATE_REP[`${rep}_invalid`] = rep;
}

/** Implemented state representations — expand as we go */
const IMPLEMENTED_STATE_REPS = new Set<StateRepresentation>(["request"]);

function loadBundle(toolName: string): ToolParameterBundleModel | undefined {
  const filePath = path.join(MODELS_DIR, `${toolName}.json`);
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function shouldSkipTool(toolName: string, bundle: ToolParameterBundleModel): string | null {
  // Check all parameter types are registered
  const paramTypes = collectParameterTypes(bundle);
  for (const pt of paramTypes) {
    if (!isParameterTypeRegistered(pt)) {
      return `parameter_type '${pt}' not registered`;
    }
  }
  // Check all validator types are registered
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

function validatePayload(schema: S.Schema.Any, payload: unknown): Either.Either<unknown, unknown> {
  return S.decodeUnknownEither(schema, { onExcessProperty: "error" })(payload);
}

// Counters for summary
let totalRun = 0;
let totalPassed = 0;
let totalSkippedTools = 0;
let totalSkippedKeys = 0;

describe("parameter specification", () => {
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

      for (const [specKey, testCases] of Object.entries(combos)) {
        const keySkipReason = shouldSkipSpecKey(specKey);
        if (keySkipReason) {
          it.skip(`${specKey}: ${keySkipReason}`, () => {});
          totalSkippedKeys++;
          continue;
        }

        const stateRep = SPEC_KEY_TO_STATE_REP[specKey]!;
        const isValid = specKey.endsWith("_valid");
        const schema = createFieldModel(bundle, stateRep);

        if (!schema) {
          it.skip(`${specKey}: createFieldModel returned undefined`, () => {});
          totalSkippedKeys++;
          continue;
        }

        for (let i = 0; i < (testCases as unknown[]).length; i++) {
          const testCase = (testCases as unknown[])[i];
          const label = `${specKey}[${i}]: ${JSON.stringify(testCase)}`;

          it(label, () => {
            totalRun++;
            const result = validatePayload(schema, testCase);
            if (isValid) {
              if (Either.isLeft(result)) {
                expect.fail(`Expected valid but got error: ${JSON.stringify(result.left)}`);
              }
            } else {
              if (Either.isRight(result)) {
                expect.fail(
                  `Expected invalid but validation passed for: ${JSON.stringify(testCase)}`,
                );
              }
            }
            totalPassed++;
          });
        }
      }

      // Auto-inference: request_internal from request (mirrors Python lines 127-131)
      if (
        IMPLEMENTED_STATE_REPS.has("request_internal") &&
        !combos["request_internal_valid"] &&
        combos["request_valid"]
      ) {
        const schema = createFieldModel(bundle, "request_internal");
        if (schema) {
          for (let i = 0; i < (combos["request_valid"] as unknown[]).length; i++) {
            const testCase = (combos["request_valid"] as unknown[])[i];
            it(`request_internal_valid (inferred)[${i}]: ${JSON.stringify(testCase)}`, () => {
              totalRun++;
              const result = validatePayload(schema, testCase);
              if (Either.isLeft(result)) {
                expect.fail(
                  `Expected valid (inferred from request_valid) but got error: ${JSON.stringify(result.left)}`,
                );
              }
              totalPassed++;
            });
          }
        }
      }
      if (
        IMPLEMENTED_STATE_REPS.has("request_internal") &&
        !combos["request_internal_invalid"] &&
        combos["request_invalid"]
      ) {
        const schema = createFieldModel(bundle, "request_internal");
        if (schema) {
          for (let i = 0; i < (combos["request_invalid"] as unknown[]).length; i++) {
            const testCase = (combos["request_invalid"] as unknown[])[i];
            it(`request_internal_invalid (inferred)[${i}]: ${JSON.stringify(testCase)}`, () => {
              totalRun++;
              const result = validatePayload(schema, testCase);
              if (Either.isRight(result)) {
                expect.fail(
                  `Expected invalid (inferred from request_invalid) but validation passed`,
                );
              }
              totalPassed++;
            });
          }
        }
      }
    });
  }

  afterAll(() => {
    const paramTypes = registeredParameterTypes();
    const valTypes = registeredValidatorTypes();
    console.log(
      `\nSpec summary: ${totalPassed} passed, ${totalRun - totalPassed} failed, ` +
        `${totalSkippedTools} tools skipped, ${totalSkippedKeys} keys skipped`,
    );
    console.log(`Registered parameter types: ${[...paramTypes].join(", ") || "(none)"}`);
    console.log(`Registered validator types: ${[...valTypes].join(", ") || "(none)"}`);
    console.log(`Implemented state reps: ${[...IMPLEMENTED_STATE_REPS].join(", ")}`);
  });
});
