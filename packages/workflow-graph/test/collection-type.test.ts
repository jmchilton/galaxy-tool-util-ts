import { describe, it, expect } from "vitest";

import {
  ANY_COLLECTION_TYPE_DESCRIPTION,
  CollectionTypeDescription,
  NULL_COLLECTION_TYPE_DESCRIPTION,
  isValidCollectionTypeStr,
} from "../src/collection-type.js";

const ct = (collectionType: string) => new CollectionTypeDescription(collectionType);

describe("CollectionTypeDescription.accepts", () => {
  it("matches equal simple collection types", () => {
    expect(ct("list").accepts(ct("list"))).toBe(true);
    expect(ct("paired").accepts(ct("paired"))).toBe(true);
    expect(ct("list:paired").accepts(ct("list:paired"))).toBe(true);
  });

  it("does not match differing simple types", () => {
    expect(ct("list").accepts(ct("paired"))).toBe(false);
    expect(ct("paired").accepts(ct("list"))).toBe(false);
  });

  it("returns false vs NULL sentinel", () => {
    expect(ct("list").accepts(NULL_COLLECTION_TYPE_DESCRIPTION)).toBe(false);
  });

  it("returns true vs ANY sentinel", () => {
    expect(ct("list").accepts(ANY_COLLECTION_TYPE_DESCRIPTION)).toBe(true);
  });

  describe("paired_or_unpaired", () => {
    it("paired_or_unpaired requirement is satisfied by paired (not vice versa)", () => {
      expect(ct("paired_or_unpaired").accepts(ct("paired"))).toBe(true);
      expect(ct("paired").accepts(ct("paired_or_unpaired"))).toBe(false);
      expect(ct("list:paired_or_unpaired").accepts(ct("list:paired"))).toBe(true);
      expect(ct("list:paired").accepts(ct("list:paired_or_unpaired"))).toBe(false);
    });

    it("accepts a list at list:paired_or_unpaired", () => {
      expect(ct("list:paired_or_unpaired").accepts(ct("list"))).toBe(true);
    });

    it("does not accept list:list at list:paired_or_unpaired", () => {
      expect(ct("list:paired_or_unpaired").accepts(ct("list:list"))).toBe(false);
    });
  });

  describe("sample_sheet asymmetry", () => {
    it("list requirement is satisfied by sample_sheet (not vice versa)", () => {
      expect(ct("list").accepts(ct("sample_sheet"))).toBe(true);
      expect(ct("sample_sheet").accepts(ct("list"))).toBe(false);
      expect(ct("list:paired").accepts(ct("sample_sheet:paired"))).toBe(true);
      expect(ct("sample_sheet:paired").accepts(ct("list:paired"))).toBe(false);
    });

    it("sample_sheet:paired_or_unpaired accepts list:paired_or_unpaired output but not vice versa", () => {
      expect(ct("list:paired_or_unpaired").accepts(ct("sample_sheet:paired_or_unpaired"))).toBe(
        true,
      );
      expect(ct("sample_sheet:paired_or_unpaired").accepts(ct("list:paired_or_unpaired"))).toBe(
        false,
      );
    });
  });
});

describe("CollectionTypeDescription.compatible (symmetric)", () => {
  it("is symmetric for sample_sheet/list subtype pair", () => {
    expect(ct("list").compatible(ct("sample_sheet"))).toBe(true);
    expect(ct("sample_sheet").compatible(ct("list"))).toBe(true);
    expect(ct("list:paired").compatible(ct("sample_sheet:paired"))).toBe(true);
    expect(ct("sample_sheet:paired").compatible(ct("list:paired"))).toBe(true);
  });

  it("is symmetric for paired/paired_or_unpaired subtype pair", () => {
    expect(ct("paired").compatible(ct("paired_or_unpaired"))).toBe(true);
    expect(ct("paired_or_unpaired").compatible(ct("paired"))).toBe(true);
    expect(ct("list:paired").compatible(ct("list:paired_or_unpaired"))).toBe(true);
    expect(ct("list:paired_or_unpaired").compatible(ct("list:paired"))).toBe(true);
  });

  it("same type is compatible with itself", () => {
    expect(ct("list").compatible(ct("list"))).toBe(true);
    expect(ct("paired").compatible(ct("paired"))).toBe(true);
  });

  it("disjoint types are not compatible (either order)", () => {
    expect(ct("paired").compatible(ct("list"))).toBe(false);
    expect(ct("list").compatible(ct("paired"))).toBe(false);
    expect(ct("list:paired").compatible(ct("list:list"))).toBe(false);
    expect(ct("list:list").compatible(ct("list:paired"))).toBe(false);
  });
});

describe("CollectionTypeDescription.canMapOver", () => {
  it("list can map over paired_or_unpaired (subcollection)", () => {
    expect(ct("list").canMapOver(ct("paired_or_unpaired"))).toBe(true);
  });

  it("list:paired can map over paired", () => {
    expect(ct("list:paired").canMapOver(ct("paired"))).toBe(true);
  });

  it("list cannot map over itself", () => {
    expect(ct("list").canMapOver(ct("list"))).toBe(false);
  });

  it("list:paired can map over paired_or_unpaired (universal suffix)", () => {
    expect(ct("list:paired").canMapOver(ct("paired_or_unpaired"))).toBe(true);
  });

  it("list:list:paired can map over list:paired_or_unpaired via compound suffix", () => {
    expect(ct("list:list:paired").canMapOver(ct("list:paired_or_unpaired"))).toBe(true);
  });

  it("refuses to map over ANY sentinel", () => {
    expect(ct("list").canMapOver(ANY_COLLECTION_TYPE_DESCRIPTION)).toBe(false);
  });

  it("plain list output cannot map over a sample_sheet input (asymmetry)", () => {
    expect(ct("list:list").canMapOver(ct("sample_sheet"))).toBe(false);
    expect(ct("list:paired").canMapOver(ct("sample_sheet:paired"))).toBe(false);
  });

  it("sample_sheet:list output can map over a sample_sheet input", () => {
    expect(ct("sample_sheet:list").canMapOver(ct("sample_sheet"))).toBe(true);
  });
});

describe("CollectionTypeDescription.append", () => {
  it("appends a normal collection type", () => {
    const appended = ct("list").append(ct("paired"));
    expect(appended.collectionType).toBe("list:paired");
  });

  it("appending NULL yields this", () => {
    const list = ct("list");
    expect(list.append(NULL_COLLECTION_TYPE_DESCRIPTION)).toBe(list);
  });

  it("appending ANY yields ANY", () => {
    expect(ct("list").append(ANY_COLLECTION_TYPE_DESCRIPTION)).toBe(
      ANY_COLLECTION_TYPE_DESCRIPTION,
    );
  });
});

describe("CollectionTypeDescription.effectiveMapOver", () => {
  it("strips matching suffix", () => {
    const effective = ct("list:paired").effectiveMapOver(ct("paired"));
    expect(effective.collectionType).toBe("list");
  });

  it("returns NULL when not mappable", () => {
    const effective = ct("list").effectiveMapOver(ct("paired"));
    expect(effective).toBe(NULL_COLLECTION_TYPE_DESCRIPTION);
  });

  it("list over paired_or_unpaired keeps the list rank", () => {
    const effective = ct("list").effectiveMapOver(ct("paired_or_unpaired"));
    expect(effective.collectionType).toBe("list");
  });

  it("list:paired over paired_or_unpaired strips one rank", () => {
    const effective = ct("list:paired").effectiveMapOver(ct("paired_or_unpaired"));
    expect(effective.collectionType).toBe("list");
  });

  it("list:list over list:paired_or_unpaired produces list", () => {
    const effective = ct("list:list").effectiveMapOver(ct("list:paired_or_unpaired"));
    expect(effective.collectionType).toBe("list");
  });
});

describe("sentinels", () => {
  it("NULL accepts nothing, including itself", () => {
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.accepts(NULL_COLLECTION_TYPE_DESCRIPTION)).toBe(false);
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.accepts(ct("list"))).toBe(false);
  });

  it("ANY accepts any non-NULL", () => {
    expect(ANY_COLLECTION_TYPE_DESCRIPTION.accepts(ct("list"))).toBe(true);
    expect(ANY_COLLECTION_TYPE_DESCRIPTION.accepts(NULL_COLLECTION_TYPE_DESCRIPTION)).toBe(false);
  });

  it("NULL is compatible with nothing", () => {
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.compatible(ct("list"))).toBe(false);
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.compatible(ANY_COLLECTION_TYPE_DESCRIPTION)).toBe(
      false,
    );
  });

  it("NULL.append(other) returns other", () => {
    const list = ct("list");
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.append(list)).toBe(list);
  });

  it("ANY.append always returns ANY", () => {
    expect(ANY_COLLECTION_TYPE_DESCRIPTION.append(ct("list"))).toBe(
      ANY_COLLECTION_TYPE_DESCRIPTION,
    );
  });

  it("equal is reference-based on sentinels", () => {
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.equal(NULL_COLLECTION_TYPE_DESCRIPTION)).toBe(true);
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.equal(ANY_COLLECTION_TYPE_DESCRIPTION)).toBe(false);
    expect(ANY_COLLECTION_TYPE_DESCRIPTION.equal(ANY_COLLECTION_TYPE_DESCRIPTION)).toBe(true);
  });
});

describe("isValidCollectionTypeStr", () => {
  it("accepts simple and compound types", () => {
    expect(isValidCollectionTypeStr("list")).toBe(true);
    expect(isValidCollectionTypeStr("list:paired")).toBe(true);
    expect(isValidCollectionTypeStr("list:list:paired")).toBe(true);
  });

  it("accepts sample_sheet variants", () => {
    expect(isValidCollectionTypeStr("sample_sheet")).toBe(true);
    expect(isValidCollectionTypeStr("sample_sheet:paired")).toBe(true);
    expect(isValidCollectionTypeStr("sample_sheet:paired_or_unpaired")).toBe(true);
  });

  it("rejects unknown element types", () => {
    expect(isValidCollectionTypeStr("bogus")).toBe(false);
    expect(isValidCollectionTypeStr("list:bogus")).toBe(false);
  });

  it("treats empty / undefined as valid", () => {
    expect(isValidCollectionTypeStr(undefined)).toBe(true);
    expect(isValidCollectionTypeStr("")).toBe(true);
  });
});
