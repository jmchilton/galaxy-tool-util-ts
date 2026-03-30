import * as S from "@effect/schema/Schema";
import type { InRangeValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

function applyInRange(schema: S.Schema.Any, validator: unknown): S.Schema.Any {
  const v = validator as InRangeValidatorModel;
  return (schema as S.Schema<number>).pipe(
    S.filter((value: number) => {
      let inRange = true;
      if (v.min != null) {
        inRange = inRange && (v.exclude_min ? value > v.min : value >= v.min);
      }
      if (v.max != null) {
        inRange = inRange && (v.exclude_max ? value < v.max : value <= v.max);
      }
      return v.negate ? !inRange : inRange;
    }),
  ) as S.Schema.Any;
}

registerValidatorType("in_range", applyInRange);
