import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeToolSearchResults } from "../../src/models/toolshed-search.js";

const fixturesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "toolshed-search",
);

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), "utf8"));
}

describe("normalizeToolSearchResults", () => {
  it("normalizes a real Tool Shed search response", () => {
    const result = normalizeToolSearchResults(loadFixture("fastqc-page1.json"));

    expect(result.total_results).toBe(32);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(3);
    expect(result.hostname).toBe("https://toolshed.g2.bx.psu.edu");
    expect(result.hits).toHaveLength(3);

    const first = result.hits[0];
    expect(first.tool.id).toBe("fastqc");
    expect(first.tool.name).toBe("FastQC");
    expect(first.tool.repo_owner_username).toBe("devteam");
    expect(first.tool.repo_name).toBe("fastqc");
    expect(first.tool.description).toBe("Read Quality reports");
    expect(first.tool.version).toBeUndefined();
    expect(first.tool.changeset_revision).toBeUndefined();
    expect(first.matched_terms).toEqual({ name: "fastqc", help: "fastqc" });
    expect(first.score).toBeGreaterThan(0);
  });

  it("preserves optional version and changeset_revision when present", () => {
    const result = normalizeToolSearchResults(loadFixture("with-optional-fields.json"));
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].tool.version).toBe("0.74+galaxy0");
    expect(result.hits[0].tool.changeset_revision).toBe("abc123def456");
  });

  it("handles an empty hits array", () => {
    const result = normalizeToolSearchResults(loadFixture("empty.json"));
    expect(result.total_results).toBe(0);
    expect(result.hits).toEqual([]);
    expect(result.hostname).toBe("https://toolshed.g2.bx.psu.edu");
  });

  it("coerces numeric strings to numbers for pagination fields", () => {
    const result = normalizeToolSearchResults({
      total_results: "42",
      page: "2",
      page_size: "10",
      hostname: "https://toolshed.example",
      hits: [],
    });
    expect(result.total_results).toBe(42);
    expect(result.page).toBe(2);
    expect(result.page_size).toBe(10);
  });

  it("accepts numeric pagination fields as numbers", () => {
    const result = normalizeToolSearchResults({
      total_results: 5,
      page: 1,
      page_size: 5,
      hostname: "https://toolshed.example",
      hits: [],
    });
    expect(result.total_results).toBe(5);
  });

  it("treats null and missing description as null", () => {
    const result = normalizeToolSearchResults({
      total_results: "1",
      page: "1",
      page_size: "10",
      hostname: "https://toolshed.example",
      hits: [
        {
          tool: {
            id: "x",
            name: "X",
            description: null,
            repo_name: "r",
            repo_owner_username: "o",
          },
          matched_terms: {},
          score: 1,
        },
      ],
    });
    expect(result.hits[0].tool.description).toBeNull();
  });

  it("throws with a descriptive message when payload is not an object", () => {
    expect(() => normalizeToolSearchResults(null)).toThrow(/payload must be an object/);
    expect(() => normalizeToolSearchResults("nope")).toThrow(/payload must be an object/);
  });

  it("throws when total_results is not numeric", () => {
    expect(() =>
      normalizeToolSearchResults({
        total_results: "not-a-number",
        page: "1",
        page_size: "10",
        hostname: "https://toolshed.example",
        hits: [],
      }),
    ).toThrow(/total_results.*not numeric/);
  });

  it("throws when hostname is missing", () => {
    expect(() =>
      normalizeToolSearchResults({
        total_results: "0",
        page: "1",
        page_size: "10",
        hits: [],
      }),
    ).toThrow(/`hostname` must be a string/);
  });

  it("throws when a hit's tool is missing a required field", () => {
    expect(() =>
      normalizeToolSearchResults({
        total_results: "1",
        page: "1",
        page_size: "10",
        hostname: "https://toolshed.example",
        hits: [
          {
            tool: { id: "x", name: "X", description: null, repo_name: "r" },
            matched_terms: {},
            score: 1,
          },
        ],
      }),
    ).toThrow(/hits\[0\]\.tool\.repo_owner_username/);
  });

  it("throws when matched_terms contains a non-string value", () => {
    expect(() =>
      normalizeToolSearchResults({
        total_results: "1",
        page: "1",
        page_size: "10",
        hostname: "https://toolshed.example",
        hits: [
          {
            tool: {
              id: "x",
              name: "X",
              description: null,
              repo_name: "r",
              repo_owner_username: "o",
            },
            matched_terms: { name: 5 },
            score: 1,
          },
        ],
      }),
    ).toThrow(/hits\[0\]\.matched_terms\["name"\]/);
  });

  it("throws when score is not finite", () => {
    expect(() =>
      normalizeToolSearchResults({
        total_results: "1",
        page: "1",
        page_size: "10",
        hostname: "https://toolshed.example",
        hits: [
          {
            tool: {
              id: "x",
              name: "X",
              description: null,
              repo_name: "r",
              repo_owner_username: "o",
            },
            matched_terms: {},
            score: "high",
          },
        ],
      }),
    ).toThrow(/hits\[0\]\.score must be a finite number/);
  });
});
