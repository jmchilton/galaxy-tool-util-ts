import * as S from "effect/Schema";
import type { RegexValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

function applyRegex(schema: S.Schema.Any, validator: unknown): S.Schema.Any {
  const v = validator as RegexValidatorModel;
  if (v.negate) {
    const re = new RegExp(v.expression);
    return (schema as S.Schema<string>).pipe(
      S.filter((value: string) => !re.test(value), { jsonSchema: {} }),
    ) as S.Schema.Any;
  }
  // Non-negated: S.pattern() emits JSON Schema "pattern" keyword and validates at runtime.
  // Python re.match anchors at start; add ^ if missing to match semantics.
  let pattern = v.expression;
  if (!pattern.startsWith("^")) pattern = "^" + pattern;
  return (schema as S.Schema<string>).pipe(S.pattern(new RegExp(pattern))) as S.Schema.Any;
}

registerValidatorType("regex", applyRegex);
