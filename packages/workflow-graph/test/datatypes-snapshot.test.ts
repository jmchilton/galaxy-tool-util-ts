import { describe, expect, it } from "vitest";

import { producesAcceptableDatatype } from "../src/connection-acceptable.js";
import { DATATYPES_SNAPSHOT, snapshotDatatypesMapper } from "../src/datatypes-snapshot.js";
import * as index from "../src/index.js";

describe("DATATYPES_SNAPSHOT", () => {
  it("records where it was fetched from", () => {
    const { source } = DATATYPES_SNAPSHOT;
    expect(source.galaxyUrl).toMatch(/^https?:\/\//);
    expect(source.path).toBe("/api/datatypes/types_and_mapping?upload_only=false");
    expect(source.versionMajor).toMatch(/^\d+\.\d+$/);
    expect(source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("includes non-upload datatypes and maps every one to a class", () => {
    const { datatypes, datatypes_mapping } = DATATYPES_SNAPSHOT.typesAndMapping;
    expect(datatypes).toContain("fastqsanger");
    expect(datatypes).toContain("data");
    for (const ext of datatypes) {
      expect(datatypes_mapping.ext_to_class_name[ext], ext).toBeDefined();
    }
  });

  it("is not exported from the package index", () => {
    expect(Object.keys(index)).not.toContain("DATATYPES_SNAPSHOT");
    expect(Object.keys(index)).not.toContain("snapshotDatatypesMapper");
  });
});

describe("snapshotDatatypesMapper", () => {
  const mapper = snapshotDatatypesMapper();

  it("is memoized", () => {
    expect(snapshotDatatypesMapper()).toBe(mapper);
  });

  it.each([
    ["fastqsanger", "fastq", true],
    ["fasta", "data", true],
    ["tabular", "txt", true],
    ["bed", "interval", true],
    ["bam", "fasta", false],
    ["fastqsanger", "fastqsanger.gz", false],
    // Client-side mapping names compressed variants after their parent class.
    ["fastqsanger.gz", "fastqsanger", true],
  ])("isSubType(%s, %s) is %s", (child, parent, expected) => {
    expect(mapper.isSubType(child, parent)).toBe(expected);
  });

  it("rejects a bam output feeding a fasta input", () => {
    const result = producesAcceptableDatatype(mapper, ["fasta"], ["bam"]);
    expect(result.canAccept).toBe(false);
    expect(result.reason).toContain("do not appear to match");
  });

  it("reports unknown extensions", () => {
    const result = producesAcceptableDatatype(mapper, ["fasta"], ["not_a_galaxy_type"]);
    expect(result.canAccept).toBe(false);
    expect(result.reason).toContain("[not_a_galaxy_type] unknown");
  });
});
