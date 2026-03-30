import * as S from "effect/Schema";
import type { LengthValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

function applyLength(schema: S.Schema.Any, validator: unknown): S.Schema.Any {
  const v = validator as LengthValidatorModel;
  if (v.negate) {
    const notConstraint: Record<string, number> = {};
    if (v.min != null) notConstraint.minLength = v.min;
    if (v.max != null) notConstraint.maxLength = v.max;
    return (schema as S.Schema<string>).pipe(
      S.filter(
        (value: string) => {
          let valid = true;
          if (v.min != null) valid = valid && value.length >= v.min;
          if (v.max != null) valid = valid && value.length <= v.max;
          return !valid;
        },
        { jsonSchema: { not: notConstraint } },
      ),
    ) as S.Schema.Any;
  }
  // Non-negated: use built-in combinators that emit JSON Schema keywords
  let s = schema as S.Schema<string>;
  if (v.min != null) s = s.pipe(S.minLength(v.min));
  if (v.max != null) s = s.pipe(S.maxLength(v.max));
  return s as S.Schema.Any;
}

registerValidatorType("length", applyLength);
