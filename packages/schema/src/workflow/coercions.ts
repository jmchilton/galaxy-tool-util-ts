/**
 * Pure scalar coercion parsers shared by state-merge and stateful-convert.
 *
 * Each function returns the parsed value or `null` when the input can't be
 * interpreted. Callers choose whether to fall back to the original value
 * (passthrough: `parseX(v) ?? v`) or treat `null` as an error.
 */

/** Parse boolean or "true"/"false" string → boolean. Case-insensitive. */
export function parseBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return null;
}

/** Parse number or non-empty numeric string → number. */
export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    if (!isNaN(n)) return n;
  }
  return null;
}

/**
 * Parse an array (passthrough) or comma-delimited string → string[].
 * Empty string yields `[]`. Returns null for other inputs.
 */
export function parseStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    if (value === "") return [];
    return value.split(",");
  }
  return null;
}

/**
 * Parse an array or comma-delimited string → numeric array. Elements that
 * can't be parsed as numbers are preserved as strings. Empty string → `[]`.
 */
export function parseNumberArray(value: unknown): (number | string)[] | null {
  if (Array.isArray(value)) {
    return value.map((v) => {
      const n = Number(v);
      return isNaN(n) ? (v as string) : n;
    });
  }
  if (typeof value === "string") {
    if (value === "") return [];
    return value.split(",").map((s) => {
      const n = Number(s);
      return isNaN(n) ? s : n;
    });
  }
  return null;
}
