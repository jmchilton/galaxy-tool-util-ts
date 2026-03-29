import * as S from "@effect/schema/Schema";
import type { LengthValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

function applyLength(schema: S.Schema.Any, validator: unknown): S.Schema.Any {
  const v = validator as LengthValidatorModel;
  return (schema as S.Schema<string>).pipe(
    S.filter((value: string) => {
      let valid = true;
      if (v.min != null) {
        valid = valid && value.length >= v.min;
      }
      if (v.max != null) {
        valid = valid && value.length <= v.max;
      }
      return v.negate ? !valid : valid;
    }),
  ) as S.Schema.Any;
}

registerValidatorType("length", applyLength);
