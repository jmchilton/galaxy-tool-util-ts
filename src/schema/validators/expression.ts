import * as S from "@effect/schema/Schema";
import type { ExpressionValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

/**
 * Evaluate a subset of Python expressions used in Galaxy validators.
 * Supports:
 *   - 'literal' in value  (substring check)
 *   - value == 'literal'  (equality)
 *
 * Returns undefined (pass-through) for unrecognized expressions,
 * since we can't eval arbitrary Python in JS.
 */
function tryEvaluate(expression: string, value: string): boolean | undefined {
  // Match: 'literal' in value
  const inMatch = expression.match(/^'([^']*)'\s+in\s+value$/);
  if (inMatch) {
    return value.includes(inMatch[1]);
  }

  // Match: "literal" in value
  const inMatchDQ = expression.match(/^"([^"]*)"\s+in\s+value$/);
  if (inMatchDQ) {
    return value.includes(inMatchDQ[1]);
  }

  // Match: value == 'literal' or value == "literal"
  const eqMatch = expression.match(/^value\s*==\s*['"]([^'"]*)['"]\s*$/);
  if (eqMatch) {
    return value === eqMatch[1];
  }

  return undefined;
}

function applyExpression(schema: S.Schema.Any, validator: unknown): S.Schema.Any {
  const v = validator as ExpressionValidatorModel;
  return (schema as S.Schema<string>).pipe(
    S.filter((value: string) => {
      const result = tryEvaluate(v.expression, value);
      if (result === undefined) {
        // Unrecognized expression — pass through (can't validate)
        return true;
      }
      return v.negate ? !result : result;
    }),
  ) as S.Schema.Any;
}

registerValidatorType("expression", applyExpression);
