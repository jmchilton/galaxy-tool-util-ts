import { describe, expect, it } from "vitest";

import { ConnectionAcceptable, producesAcceptableDatatype } from "../src/connection-acceptable.js";
import { testDatatypesMapper } from "./fixtures.js";

describe("producesAcceptableDatatype", () => {
  it("accepts exact datatype match", () => {
    const result = producesAcceptableDatatype(testDatatypesMapper, ["txt"], ["txt"]);
    expect(result).toBeInstanceOf(ConnectionAcceptable);
    expect(result.canAccept).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("accepts subtype match (txt is a subtype of data)", () => {
    const result = producesAcceptableDatatype(testDatatypesMapper, ["data"], ["txt"]);
    expect(result.canAccept).toBe(true);
  });

  it("accepts when input datatype is 'input' wildcard", () => {
    const result = producesAcceptableDatatype(testDatatypesMapper, ["input"], ["whatever"]);
    expect(result.canAccept).toBe(true);
  });

  it("accepts when other datatype is 'input' wildcard", () => {
    const result = producesAcceptableDatatype(testDatatypesMapper, ["txt"], ["input"]);
    expect(result.canAccept).toBe(true);
  });

  it("accepts when other datatype is '_sniff_' wildcard", () => {
    const result = producesAcceptableDatatype(testDatatypesMapper, ["txt"], ["_sniff_"]);
    expect(result.canAccept).toBe(true);
  });

  it("rejects incompatible known datatypes with a mismatch message", () => {
    const result = producesAcceptableDatatype(testDatatypesMapper, ["tabular"], ["ab1"]);
    expect(result.canAccept).toBe(false);
    expect(result.reason).toMatch(/do not appear to match/);
    expect(result.reason).toMatch(/ab1/);
    expect(result.reason).toMatch(/tabular/);
  });

  it("rejects unknown output datatypes with an 'unknown' message", () => {
    const result = producesAcceptableDatatype(testDatatypesMapper, ["txt"], ["bogus_ext"]);
    expect(result.canAccept).toBe(false);
    expect(result.reason).toMatch(/unknown/);
    expect(result.reason).toMatch(/bogus_ext/);
  });

  it("accepts when any one of multiple input types matches", () => {
    const result = producesAcceptableDatatype(testDatatypesMapper, ["ab1", "data"], ["txt"]);
    expect(result.canAccept).toBe(true);
  });

  it("accepts when any one of multiple output types matches an input type", () => {
    const result = producesAcceptableDatatype(testDatatypesMapper, ["data"], ["ab1", "txt"]);
    expect(result.canAccept).toBe(true);
  });
});

describe("ConnectionAcceptable", () => {
  it("stores canAccept and reason", () => {
    const ok = new ConnectionAcceptable(true, null);
    expect(ok.canAccept).toBe(true);
    expect(ok.reason).toBeNull();
    const no = new ConnectionAcceptable(false, "nope");
    expect(no.canAccept).toBe(false);
    expect(no.reason).toBe("nope");
  });
});
