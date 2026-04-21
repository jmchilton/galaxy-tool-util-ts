import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateTestsFile } from "../src/test-format/index.js";

const FIXTURES_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "test-format");

function fixturesIn(kind: "positive" | "negative"): { name: string; path: string }[] {
  const dir = join(FIXTURES_ROOT, kind);
  return readdirSync(dir)
    .filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))
    .sort()
    .map((name) => ({ name, path: join(dir, name) }));
}

function validateFixture(path: string) {
  return validateTestsFile(parseYaml(readFileSync(path, "utf-8")));
}

describe("validateTestsFile — positive fixtures", () => {
  for (const { name, path } of fixturesIn("positive")) {
    it(`accepts ${name}`, () => {
      const result = validateFixture(path);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }
});

describe("validateTestsFile — negative fixtures", () => {
  for (const { name, path } of fixturesIn("negative")) {
    it(`rejects ${name}`, () => {
      const result = validateFixture(path);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  }
});

describe("validateTestsFile — diagnostics shape", () => {
  it("returns path, message, keyword, params on failure", () => {
    const result = validateTestsFile([
      { doc: "bad", job: { bad_file: { class: "File", bogus: "yes" } }, outputs: {} },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({
      path: expect.any(String),
      message: expect.any(String),
      keyword: expect.any(String),
    });
  });
});
