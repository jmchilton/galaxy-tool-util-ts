import * as S from "@effect/schema/Schema";
import type { RegexValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

function applyRegex(schema: S.Schema.Any, validator: unknown): S.Schema.Any {
  const v = validator as RegexValidatorModel;
  const re = new RegExp(v.expression);
  return (schema as S.Schema<string>).pipe(
    S.filter((value: string) => {
      const matches = re.test(value);
      return v.negate ? !matches : matches;
    }),
  ) as S.Schema.Any;
}

registerValidatorType("regex", applyRegex);
