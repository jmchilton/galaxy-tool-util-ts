import * as S from "effect/Schema";
import type { RegexValidatorModel } from "../bundle-types.js";
import { registerValidatorType } from "./registry.js";

/**
 * Convert Python inline flags (?aiLmsux) at the start of a pattern to JS RegExp flags.
 * Unsupported flags (a, L, u, x) are silently dropped.
 * Also handles ^(?flags) where the anchor precedes the flag group.
 */
export function pythonToJsRegex(expression: string): { pattern: string; flags: string } {
  const m = expression.match(/^(\^?)\(\?([aiLmsux]+)\)/);
  if (!m) return { pattern: expression, flags: "" };
  const anchor = m[1]; // "" or "^"
  const flagChars = m[2];
  let flags = "";
  if (flagChars.includes("i")) flags += "i";
  if (flagChars.includes("m")) flags += "m";
  if (flagChars.includes("s")) flags += "s";
  return { pattern: anchor + expression.slice(m[0].length), flags };
}

/**
 * Strip Python identity escapes that are invalid under ECMA-262 unicode mode.
 * Python allows \X for any character X (it's an identity escape), but JS /u mode
 * only allows escaping syntax characters. We strip backslashes before non-syntax chars.
 *
 * ECMA-262 syntax characters (safe to escape): ^ $ \ . * + ? ( ) [ ] { } |
 */
export function stripPythonIdentityEscapes(pattern: string): string {
  // Match \\ (escaped backslash) first to skip it, then \X where X is not
  // an ECMA-262 syntax char or standard escape letter.
  // Standard escape letters: d, D, w, W, s, S, b, B, n, r, t, f, v, 0, c, x, u, p, P, k
  return pattern.replace(
    /\\\\|\\([^\\^$.*+?()[\]{}|dDwWsSnrtfv0cxupPkbB])/g,
    (match, captured) => captured !== undefined ? captured : match,
  );
}

/**
 * Convert []] (legacy PCRE/Python idiom for literal ]) to [\]] for ECMA-262 /u compat.
 */
export function fixBracketCharClass(pattern: string): string {
  return pattern.replace(/\[\]\]/g, "[\\]]");
}

/**
 * Make a pattern safe for JSON Schema's `pattern` keyword (ECMA-262, validated in /u mode by AJV).
 * Returns null if the pattern can't be made safe.
 */
export function jsonSchemaSafePattern(pattern: string): string | null {
  let safe = stripPythonIdentityEscapes(pattern);
  safe = fixBracketCharClass(safe);
  // Pre-flight: verify the result compiles under /u mode (AJV's validation mode)
  try {
    new RegExp(safe, "u");
    return safe;
  } catch {
    return null;
  }
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
    // JSON Schema `pattern` doesn't support regex flags (s, i, m).
    // When flags are present, skip the pattern annotation.
    // Otherwise, make the pattern /u-safe for AJV and wrap with empty-string exemption.
    let jsonAnnotation: { jsonSchema: object };
    if (flags) {
      jsonAnnotation = { jsonSchema: {} };
    } else {
      const safe = jsonSchemaSafePattern(anchored);
      jsonAnnotation = safe
        ? { jsonSchema: { pattern: `(^$|${safe})` } }
        : { jsonSchema: {} };
    }
    return (schema as S.Schema<string>).pipe(
      S.filter((value: string) => value === "" || re.test(value), jsonAnnotation),
    ) as S.Schema.Any;
  } catch {
    return schema;
  }
}

registerValidatorType("regex", applyRegex);
