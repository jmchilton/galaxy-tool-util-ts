/**
 * Variant-array helpers for multi-accept inputs.
 *
 * Galaxy tools can declare `collection_types: string[]` on collection inputs,
 * meaning the input accepts any of several collection types. These helpers
 * mirror the inner loop of `InputCollectionTerminal._effectiveMapOver` in the
 * Galaxy editor and the Python port's `_split_collection_type` helper, minus
 * the sample_sheet asymmetry guard (which belongs in caller-side decision
 * logic — see D4 in the extraction plan).
 */

import type { CollectionTypeDescriptor } from "./collection-type.js";
import { NULL_COLLECTION_TYPE_DESCRIPTION } from "./collection-type.js";

/**
 * True if `output`'s collection type matches any of the accepted `inputs`.
 */
export function canMatchAny(
  output: CollectionTypeDescriptor,
  inputs: CollectionTypeDescriptor[],
): boolean {
  return inputs.some((input) => input.canMatch(output));
}

/**
 * Compute the effective map-over for an output connecting to a multi-accept
 * input. Mirrors `InputCollectionTerminal._effectiveMapOver`:
 * - If any accepted input directly matches the output, no map-over is needed
 *   (returns NULL).
 * - Otherwise, return the first non-null `output.effectiveMapOver(input)` for
 *   an input the output can map over.
 * - Falls back to NULL when no variant accepts the output.
 */
export function effectiveMapOverAny(
  output: CollectionTypeDescriptor,
  inputs: CollectionTypeDescriptor[],
): CollectionTypeDescriptor {
  if (inputs.some((input) => input.canMatch(output))) {
    return NULL_COLLECTION_TYPE_DESCRIPTION;
  }
  for (const input of inputs) {
    if (output.canMapOver(input)) {
      const effective = output.effectiveMapOver(input);
      if (effective !== NULL_COLLECTION_TYPE_DESCRIPTION) {
        return effective;
      }
    }
  }
  return NULL_COLLECTION_TYPE_DESCRIPTION;
}
