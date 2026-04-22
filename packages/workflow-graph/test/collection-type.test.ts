import { describe, it, expect } from "vitest";

import {
  ANY_COLLECTION_TYPE_DESCRIPTION,
  CollectionTypeDescription,
  NULL_COLLECTION_TYPE_DESCRIPTION,
  isValidCollectionTypeStr,
} from "../src/collection-type.js";

describe("CollectionTypeDescription.canMatch", () => {
  it("matches equal simple collection types", () => {
    const list = new CollectionTypeDescription("list");
    expect(list.canMatch(new CollectionTypeDescription("list"))).toBe(true);
  });

  it("does not match differing simple types", () => {
    expect(
      new CollectionTypeDescription("list").canMatch(new CollectionTypeDescription("paired")),
    ).toBe(false);
  });

  it("matches equal compound types", () => {
    expect(
      new CollectionTypeDescription("list:paired").canMatch(
        new CollectionTypeDescription("list:paired"),
      ),
    ).toBe(true);
  });

  it("returns false vs NULL sentinel", () => {
    expect(new CollectionTypeDescription("list").canMatch(NULL_COLLECTION_TYPE_DESCRIPTION)).toBe(
      false,
    );
  });

  it("returns true vs ANY sentinel", () => {
    expect(new CollectionTypeDescription("list").canMatch(ANY_COLLECTION_TYPE_DESCRIPTION)).toBe(
      true,
    );
  });

  describe("paired_or_unpaired", () => {
    it("accepts a paired collection as paired_or_unpaired", () => {
      expect(
        new CollectionTypeDescription("paired_or_unpaired").canMatch(
          new CollectionTypeDescription("paired"),
        ),
      ).toBe(true);
    });

    it("accepts a list at list:paired_or_unpaired", () => {
      expect(
        new CollectionTypeDescription("list:paired_or_unpaired").canMatch(
          new CollectionTypeDescription("list"),
        ),
      ).toBe(true);
    });

    it("accepts a list:paired at list:paired_or_unpaired", () => {
      expect(
        new CollectionTypeDescription("list:paired_or_unpaired").canMatch(
          new CollectionTypeDescription("list:paired"),
        ),
      ).toBe(true);
    });

    it("does not accept list:list at list:paired_or_unpaired", () => {
      expect(
        new CollectionTypeDescription("list:paired_or_unpaired").canMatch(
          new CollectionTypeDescription("list:list"),
        ),
      ).toBe(false);
    });
  });

  describe("sample_sheet normalization", () => {
    it("sample_sheet matches list (normalized)", () => {
      expect(
        new CollectionTypeDescription("list").canMatch(
          new CollectionTypeDescription("sample_sheet"),
        ),
      ).toBe(true);
    });

    it("sample_sheet:paired matches list:paired (normalized)", () => {
      expect(
        new CollectionTypeDescription("list:paired").canMatch(
          new CollectionTypeDescription("sample_sheet:paired"),
        ),
      ).toBe(true);
    });

    it("sample_sheet:paired_or_unpaired matches list:paired_or_unpaired", () => {
      expect(
        new CollectionTypeDescription("list:paired_or_unpaired").canMatch(
          new CollectionTypeDescription("sample_sheet:paired_or_unpaired"),
        ),
      ).toBe(true);
    });
  });
});

describe("CollectionTypeDescription.canMapOver", () => {
  it("list can map over paired_or_unpaired (subcollection)", () => {
    expect(
      new CollectionTypeDescription("list").canMapOver(
        new CollectionTypeDescription("paired_or_unpaired"),
      ),
    ).toBe(true);
  });

  it("list:paired can map over paired", () => {
    expect(
      new CollectionTypeDescription("list:paired").canMapOver(
        new CollectionTypeDescription("paired"),
      ),
    ).toBe(true);
  });

  it("list cannot map over itself", () => {
    expect(
      new CollectionTypeDescription("list").canMapOver(new CollectionTypeDescription("list")),
    ).toBe(false);
  });

  it("list:paired can map over paired_or_unpaired (universal suffix)", () => {
    expect(
      new CollectionTypeDescription("list:paired").canMapOver(
        new CollectionTypeDescription("paired_or_unpaired"),
      ),
    ).toBe(true);
  });

  it("list:list:paired can map over list:paired_or_unpaired via compound suffix", () => {
    expect(
      new CollectionTypeDescription("list:list:paired").canMapOver(
        new CollectionTypeDescription("list:paired_or_unpaired"),
      ),
    ).toBe(true);
  });

  it("refuses to map over ANY sentinel", () => {
    expect(new CollectionTypeDescription("list").canMapOver(ANY_COLLECTION_TYPE_DESCRIPTION)).toBe(
      false,
    );
  });
});

describe("CollectionTypeDescription.append", () => {
  it("appends a normal collection type", () => {
    const appended = new CollectionTypeDescription("list").append(
      new CollectionTypeDescription("paired"),
    );
    expect(appended.collectionType).toBe("list:paired");
  });

  it("appending NULL yields this", () => {
    const list = new CollectionTypeDescription("list");
    expect(list.append(NULL_COLLECTION_TYPE_DESCRIPTION)).toBe(list);
  });

  it("appending ANY yields ANY", () => {
    expect(new CollectionTypeDescription("list").append(ANY_COLLECTION_TYPE_DESCRIPTION)).toBe(
      ANY_COLLECTION_TYPE_DESCRIPTION,
    );
  });
});

describe("CollectionTypeDescription.effectiveMapOver", () => {
  it("strips matching suffix", () => {
    const effective = new CollectionTypeDescription("list:paired").effectiveMapOver(
      new CollectionTypeDescription("paired"),
    );
    expect(effective.collectionType).toBe("list");
  });

  it("returns NULL when not mappable", () => {
    const effective = new CollectionTypeDescription("list").effectiveMapOver(
      new CollectionTypeDescription("paired"),
    );
    expect(effective).toBe(NULL_COLLECTION_TYPE_DESCRIPTION);
  });

  it("list over paired_or_unpaired keeps the list rank", () => {
    const effective = new CollectionTypeDescription("list").effectiveMapOver(
      new CollectionTypeDescription("paired_or_unpaired"),
    );
    expect(effective.collectionType).toBe("list");
  });

  it("list:paired over paired_or_unpaired strips one rank", () => {
    const effective = new CollectionTypeDescription("list:paired").effectiveMapOver(
      new CollectionTypeDescription("paired_or_unpaired"),
    );
    expect(effective.collectionType).toBe("list");
  });

  it("list:list over list:paired_or_unpaired produces list", () => {
    const effective = new CollectionTypeDescription("list:list").effectiveMapOver(
      new CollectionTypeDescription("list:paired_or_unpaired"),
    );
    expect(effective.collectionType).toBe("list");
  });
});

describe("sentinels", () => {
  it("NULL does not match anything, including itself", () => {
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.canMatch(NULL_COLLECTION_TYPE_DESCRIPTION)).toBe(false);
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.canMatch(new CollectionTypeDescription("list"))).toBe(
      false,
    );
  });

  it("ANY matches any non-NULL", () => {
    expect(ANY_COLLECTION_TYPE_DESCRIPTION.canMatch(new CollectionTypeDescription("list"))).toBe(
      true,
    );
    expect(ANY_COLLECTION_TYPE_DESCRIPTION.canMatch(NULL_COLLECTION_TYPE_DESCRIPTION)).toBe(false);
  });

  it("NULL.append(other) returns other", () => {
    const list = new CollectionTypeDescription("list");
    expect(NULL_COLLECTION_TYPE_DESCRIPTION.append(list)).toBe(list);
  });

  it("ANY.append always returns ANY", () => {
    expect(ANY_COLLECTION_TYPE_DESCRIPTION.append(new CollectionTypeDescription("list"))).toBe(
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
