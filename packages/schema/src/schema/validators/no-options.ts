import * as S from "@effect/schema/Schema";
import { registerValidatorType } from "./registry.js";

/**
 * no_options validator — in Galaxy this checks that a select has options available.
 * At the schema level this is a no-op since we validate values, not option availability.
 */
function applyNoOptions(schema: S.Schema.Any, _validator: unknown): S.Schema.Any {
  return schema;
}

registerValidatorType("no_options", applyNoOptions);
