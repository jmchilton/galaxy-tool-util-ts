/**
 * Free-function wrappers around CollectionTypeDescription algebra with NULL/ANY
 * sentinel handling. Mirrors `connection_types.py` module-level functions:
 *   can_match, can_map_over, compatible, effective_map_over, is_list_like, collection_type_rank.
 *
 * Logic verified by truth-table tests in
 * `packages/workflow-graph/test/connection-type-cases.test.ts` (91 cases).
 */

import {
  ANY_COLLECTION_TYPE_DESCRIPTION,
  CollectionTypeDescription,
  NULL_COLLECTION_TYPE_DESCRIPTION,
  type CollectionTypeDescriptor,
} from "@galaxy-tool-util/workflow-graph";

export function isNullDesc(d: CollectionTypeDescriptor): boolean {
  return d === NULL_COLLECTION_TYPE_DESCRIPTION;
}

export function isAnyDesc(d: CollectionTypeDescriptor): boolean {
  return d === ANY_COLLECTION_TYPE_DESCRIPTION;
}

function splitVariants(d: CollectionTypeDescriptor): CollectionTypeDescriptor[] {
  const ct = d.collectionType;
  if (!ct || !ct.includes(",")) return [d];
  return ct.split(",").map((t) => new CollectionTypeDescription(t.trim()));
}

export function canMatch(
  output: CollectionTypeDescriptor,
  input: CollectionTypeDescriptor,
): boolean {
  if (isNullDesc(output) || isNullDesc(input)) return false;
  if (isAnyDesc(input)) return !isNullDesc(output);
  if (isAnyDesc(output)) return false;
  for (const variant of splitVariants(input)) {
    if (variant.accepts(output)) return true;
  }
  return false;
}

export function canMapOver(
  output: CollectionTypeDescriptor,
  input: CollectionTypeDescriptor,
): boolean {
  if (isNullDesc(output) || isAnyDesc(output)) return false;
  if (isAnyDesc(input)) return false;
  if (isNullDesc(input)) return true;
  for (const variant of splitVariants(input)) {
    if (output.canMapOver(variant)) return true;
  }
  return false;
}

export function compatible(a: CollectionTypeDescriptor, b: CollectionTypeDescriptor): boolean {
  if (isNullDesc(a) && isNullDesc(b)) return true;
  if (isNullDesc(a) || isNullDesc(b)) return false;
  if (isAnyDesc(a) || isAnyDesc(b)) return true;
  return a.compatible(b);
}

export function effectiveMapOver(
  output: CollectionTypeDescriptor,
  input: CollectionTypeDescriptor,
): CollectionTypeDescriptor | null {
  if (!canMapOver(output, input)) return null;
  if (isNullDesc(input)) {
    if (output instanceof CollectionTypeDescription) {
      return new CollectionTypeDescription(output.collectionType);
    }
    return output;
  }
  for (const variant of splitVariants(input)) {
    if (output.canMapOver(variant)) {
      return output.effectiveMapOver(variant);
    }
  }
  return null;
}

export function isListLike(d: CollectionTypeDescriptor): boolean {
  if (!d.isCollection) return false;
  if (isAnyDesc(d)) return false;
  let ct = d.collectionType;
  if (!ct) return false;
  if (ct.startsWith("sample_sheet")) {
    ct = "list" + ct.slice("sample_sheet".length);
  }
  return ct === "list" || ct.startsWith("list:");
}

export function collectionTypeRank(d: CollectionTypeDescriptor): number {
  return d.rank;
}

export function describe(token: string | null | undefined): CollectionTypeDescriptor {
  if (token == null || token === "NULL") return NULL_COLLECTION_TYPE_DESCRIPTION;
  if (token === "ANY") return ANY_COLLECTION_TYPE_DESCRIPTION;
  return new CollectionTypeDescription(token);
}
