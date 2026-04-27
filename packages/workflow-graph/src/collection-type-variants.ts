/**
 * Variant-array helpers for multi-accept inputs.
 *
 * Galaxy tools can declare `collection_types: string[]` on collection inputs,
 * meaning the input accepts any of several collection types. These helpers
 * mirror the inner loop of `InputCollectionTerminal._effectiveMapOver` in the
 * Galaxy editor and the Python port's `_split_collection_type` helper.
 *
 * sample_sheet asymmetry is enforced inside `CollectionTypeDescription.accepts`
 * itself, so callers don't need to re-check it here for the simple
 * `accepts(output)` cases. The Galaxy `InputCollectionTerminal.canAccept`
 * still keeps a defense-in-depth re-check for compound effective types where
 * the receiver's raw type can hide the guard from `accepts` — that remains a
 * caller-side concern.
 */

import type { CollectionTypeDescriptor } from "./collection-type.js";
import { NULL_COLLECTION_TYPE_DESCRIPTION } from "./collection-type.js";

/**
 * True if any of the accepted `inputs` accepts `output` directly.
 * Direction follows `input_type.accepts(output_type)`.
 */
export function acceptsAny(
  output: CollectionTypeDescriptor,
  inputs: CollectionTypeDescriptor[],
): boolean {
  return inputs.some((input) => input.accepts(output));
}

/**
 * Compute the effective map-over for an output connecting to a multi-accept
 * input. Mirrors `InputCollectionTerminal._effectiveMapOver`:
 * - If any accepted input directly accepts the output, no map-over is needed
 *   (returns NULL).
 * - Otherwise, return the first non-null `output.effectiveMapOver(input)` for
 *   an input the output can map over.
 * - Falls back to NULL when no variant accepts the output.
 */
export function effectiveMapOverAny(
  output: CollectionTypeDescriptor,
  inputs: CollectionTypeDescriptor[],
): CollectionTypeDescriptor {
  if (inputs.some((input) => input.accepts(output))) {
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
