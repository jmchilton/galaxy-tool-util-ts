import * as S from "effect/Schema";
import type { InRangeValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

function applyInRange(schema: S.Schema.Any, validator: unknown): S.Schema.Any {
  const v = validator as InRangeValidatorModel;
  if (v.negate) {
    // Negated range — keep S.filter, add jsonSchema annotation with not:{...}
    const notConstraint: Record<string, number> = {};
    if (v.min != null) {
      notConstraint[v.exclude_min ? "exclusiveMinimum" : "minimum"] = v.min;
    }
    if (v.max != null) {
      notConstraint[v.exclude_max ? "exclusiveMaximum" : "maximum"] = v.max;
    }
    return (schema as S.Schema<number>).pipe(
      S.filter(
        (value: number) => {
          let inRange = true;
          if (v.min != null) {
            inRange = inRange && (v.exclude_min ? value > v.min : value >= v.min);
          }
          if (v.max != null) {
            inRange = inRange && (v.exclude_max ? value < v.max : value <= v.max);
          }
          return !inRange;
        },
        { jsonSchema: { not: notConstraint } },
      ),
    ) as S.Schema.Any;
  }
  // Non-negated: use Effect Schema built-in combinators that emit JSON Schema keywords
  let s = schema as S.Schema<number>;
  if (v.min != null) {
    s = v.exclude_min ? s.pipe(S.greaterThan(v.min)) : s.pipe(S.greaterThanOrEqualTo(v.min));
  }
  if (v.max != null) {
    s = v.exclude_max ? s.pipe(S.lessThan(v.max)) : s.pipe(S.lessThanOrEqualTo(v.max));
  }
  return s as S.Schema.Any;
}

registerValidatorType("in_range", applyInRange);
