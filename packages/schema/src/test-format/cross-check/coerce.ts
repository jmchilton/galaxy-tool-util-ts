export function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

export function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** A string or list of strings as a non-empty list; `undefined` otherwise. */
export function asStringList(v: unknown): string[] | undefined {
  const list = typeof v === "string" ? [v] : Array.isArray(v) ? v.filter(isString) : [];
  return list.length > 0 ? list : undefined;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}
