import * as S from "@effect/schema/Schema";
import type { EmptyFieldValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

function applyEmptyField(schema: S.Schema.Any, validator: unknown): S.Schema.Any {
  const v = validator as EmptyFieldValidatorModel;
  return (schema as S.Schema<string>).pipe(
    S.filter((value: string) => {
      // empty_field with negate=false means "field must NOT be empty"
      const isEmpty = value.length === 0;
      return v.negate ? isEmpty : !isEmpty;
    }),
  ) as S.Schema.Any;
}

registerValidatorType("empty_field", applyEmptyField);
