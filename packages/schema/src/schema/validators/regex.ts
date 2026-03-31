import * as S from "effect/Schema";
import type { RegexValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

/**
 * Convert Python inline flags (?aiLmsux) at the start of a pattern to JS RegExp flags.
 * Unsupported flags (a, L, u, x) are silently dropped.
 */
function pythonToJsRegex(expression: string): { pattern: string; flags: string } {
  const m = expression.match(/^\(\?([aiLmsux]+)\)/);
  if (!m) return { pattern: expression, flags: "" };
  const flagChars = m[1];
  let flags = "";
  if (flagChars.includes("i")) flags += "i";
  if (flagChars.includes("m")) flags += "m";
  if (flagChars.includes("s")) flags += "s";
  return { pattern: expression.slice(m[0].length), flags };
}

function safeRegExp(expression: string): RegExp | null {
  const { pattern, flags } = pythonToJsRegex(expression);
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function applyRegex(schema: S.Schema.Any, validator: unknown): S.Schema.Any {
  const v = validator as RegexValidatorModel;
  // Galaxy treats "" as "not set" — regex validators only apply to non-empty values.
  if (v.negate) {
    const re = safeRegExp(v.expression);
    if (!re) return schema;
    return (schema as S.Schema<string>).pipe(
      S.filter((value: string) => value === "" || !re.test(value), { jsonSchema: {} }),
    ) as S.Schema.Any;
  }
  const { pattern, flags } = pythonToJsRegex(v.expression);
  let anchored = pattern;
  if (!anchored.startsWith("^")) anchored = "^" + anchored;
  try {
    const re = new RegExp(anchored, flags);
    return (schema as S.Schema<string>).pipe(
      S.filter((value: string) => value === "" || re.test(value), { jsonSchema: { pattern: anchored } }),
    ) as S.Schema.Any;
  } catch {
    return schema;
  }
}

registerValidatorType("regex", applyRegex);
