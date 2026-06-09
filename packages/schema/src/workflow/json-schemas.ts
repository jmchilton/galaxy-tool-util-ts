/**
 * Plain JSON Schema siblings of the Effect workflow schemas.
 *
 * Effect `Schema.Schema<A>` values are functions and do not survive
 * `JSON.stringify`; downstream packagers that copy a schema verbatim into a
 * runtime bundle need a plain-object JSON Schema instead. Mirrors the
 * `parsedToolSchema` pattern in `schema/parsed-tool.ts`.
 */

import { JSONSchema } from "effect";

import { GalaxyWorkflowDraftSchema } from "./raw/gxformat2-draft.effect.js";

/**
 * Effect's `JSONSchema.make` emits inline `{$id: "/schemas/unknown", ...}`
 * nodes wherever it encounters `Schema.Unknown` / `Schema.Any`. The draft
 * schema hits this dozens of times (free-form `state`, `tool_state`,
 * `default`, post-job actions, etc.), and Ajv refuses to compile a document
 * with the same `$id` resolving to multiple distinct nodes. Stripping the
 * `$id` leaves the node semantically equivalent (still accepts anything)
 * and lets standard JSON Schema validators load the result.
 */
function stripDuplicateUnknownIds(node: unknown): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) stripDuplicateUnknownIds(item);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.$id === "/schemas/unknown") delete obj.$id;
  for (const k of Object.keys(obj)) stripDuplicateUnknownIds(obj[k]);
}

/**
 * `JSONSchema.make` inlines every subschema lacking an `identifier`
 * annotation, so structurally-identical fragments (workflow step variants,
 * tool_state value types, RuntimeValue/ConnectedValue, …) are duplicated many
 * times over. The draft schema reaches ~95 KB compact and ~580 KB
 * pretty-printed (deep nesting amplifies indentation), which is impractical
 * for downstream packagers to vendor verbatim. Hoist each repeated subschema
 * into `$defs` and replace its occurrences with `$ref`, shrinking the document
 * with no change in meaning.
 *
 * Replacement happens **only at schema positions** — a `$ref` is legal where a
 * subschema is expected (`properties` values, `items`, `anyOf` members, …) but
 * not in array/value keywords like `required`, `enum`, or `type`. Output is
 * deterministic (candidates chosen by largest byte saving, ties broken by
 * canonical form; `$def` names assigned in hoist order) so the generated
 * schema is byte-stable across runs.
 */
const SCHEMA_OBJ_KEYS = [
  "additionalProperties",
  "items",
  "additionalItems",
  "contains",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
  "unevaluatedProperties",
  "unevaluatedItems",
];
const SCHEMA_MAP_KEYS = [
  "properties",
  "patternProperties",
  "dependentSchemas",
  "$defs",
  "definitions",
];
const SCHEMA_ARR_KEYS = ["allOf", "anyOf", "oneOf", "prefixItems"];

const isPlainObject = (n: unknown): n is Record<string, unknown> =>
  n !== null && typeof n === "object" && !Array.isArray(n);

/** Stable serialization (sorted object keys) for structural equality. */
function canonicalize(node: unknown): string {
  if (!isPlainObject(node)) {
    if (Array.isArray(node)) return `[${node.map(canonicalize).join(",")}]`;
    return JSON.stringify(node) ?? "null";
  }
  return `{${Object.keys(node)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize(node[k])}`)
    .join(",")}}`;
}

type SchemaVisitor = (node: unknown, replace: (next: unknown) => void, isRoot: boolean) => void;

/** Walk every node that sits in a JSON-Schema position; `replace` swaps it in its parent. */
function eachSchemaNode(
  node: unknown,
  replace: (next: unknown) => void,
  visit: SchemaVisitor,
  isRoot = true,
): void {
  visit(node, replace, isRoot);
  if (!isPlainObject(node)) return;
  for (const k of SCHEMA_OBJ_KEYS) {
    if (isPlainObject(node[k])) eachSchemaNode(node[k], (v) => (node[k] = v), visit, false);
  }
  for (const k of SCHEMA_MAP_KEYS) {
    const map = node[k];
    if (isPlainObject(map)) {
      for (const sk of Object.keys(map))
        eachSchemaNode(map[sk], (v) => (map[sk] = v), visit, false);
    }
  }
  for (const k of SCHEMA_ARR_KEYS) {
    const arr = node[k];
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++)
        eachSchemaNode(arr[i], (v) => (arr[i] = v), visit, false);
    }
  }
}

function dedupeSubschemas(root: Record<string, unknown>): void {
  const MIN_BYTES = 200;
  const defs = (root.$defs && isPlainObject(root.$defs) ? root.$defs : (root.$defs = {})) as Record<
    string,
    unknown
  >;
  let counter = 0;
  for (let guard = 0; guard < 5000; guard++) {
    const tally = new Map<string, { count: number; size: number }>();
    eachSchemaNode(
      root,
      () => {},
      (node, _replace, isRoot) => {
        if (isRoot || !isPlainObject(node)) return;
        const s = canonicalize(node);
        if (s.length < MIN_BYTES) return;
        const cur = tally.get(s);
        if (cur) cur.count++;
        else tally.set(s, { count: 1, size: s.length });
      },
    );

    let best: string | null = null;
    let bestSaving = 0;
    for (const [s, { count, size }] of tally) {
      if (count < 2) continue;
      const saving = (count - 1) * size;
      if (saving > bestSaving || (saving === bestSaving && (best === null || s < best))) {
        bestSaving = saving;
        best = s;
      }
    }
    if (best === null) break;

    const name = `Shared${counter++}`;
    const ref = `#/$defs/${name}`;
    eachSchemaNode(
      root,
      () => {},
      (node, replace, isRoot) => {
        if (isRoot || !isPlainObject(node)) return;
        if (canonicalize(node) === best) replace({ $ref: ref });
      },
    );
    defs[name] = JSON.parse(best);
  }
}

const draftJsonSchema = JSONSchema.make(GalaxyWorkflowDraftSchema, {
  target: "jsonSchema2020-12",
}) as unknown as Record<string, unknown>;
stripDuplicateUnknownIds(draftJsonSchema);
dedupeSubschemas(draftJsonSchema);

export const galaxyWorkflowDraftJsonSchema = draftJsonSchema;
