import { describe, it, expect } from "vitest";

import {
  CollectionTypeDescription,
  NULL_COLLECTION_TYPE_DESCRIPTION,
} from "../src/collection-type.js";
import { canMatchAny, effectiveMapOverAny } from "../src/collection-type-variants.js";

const listOrListPaired = [
  new CollectionTypeDescription("list"),
  new CollectionTypeDescription("list:paired"),
];

describe("canMatchAny", () => {
  it("matches when the output matches any variant", () => {
    expect(canMatchAny(new CollectionTypeDescription("list"), listOrListPaired)).toBe(true);
    expect(canMatchAny(new CollectionTypeDescription("list:paired"), listOrListPaired)).toBe(true);
  });

  it("does not match when no variant matches", () => {
    expect(canMatchAny(new CollectionTypeDescription("paired"), listOrListPaired)).toBe(false);
  });
});

describe("effectiveMapOverAny", () => {
  it("returns NULL when output already matches a variant", () => {
    expect(effectiveMapOverAny(new CollectionTypeDescription("list"), listOrListPaired)).toBe(
      NULL_COLLECTION_TYPE_DESCRIPTION,
    );
  });

  it("finds a map-over via the first compatible variant", () => {
    // list:list can map over list, yielding effective map-over "list".
    const result = effectiveMapOverAny(
      new CollectionTypeDescription("list:list"),
      listOrListPaired,
    );
    expect(result.collectionType).toBe("list");
  });

  it("returns NULL when no variant accepts and none is mappable", () => {
    expect(effectiveMapOverAny(new CollectionTypeDescription("paired"), listOrListPaired)).toBe(
      NULL_COLLECTION_TYPE_DESCRIPTION,
    );
  });
});
