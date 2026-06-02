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

const draftJsonSchema = JSONSchema.make(GalaxyWorkflowDraftSchema, {
  target: "jsonSchema2020-12",
}) as object;
stripDuplicateUnknownIds(draftJsonSchema);

export const galaxyWorkflowDraftJsonSchema = draftJsonSchema;
