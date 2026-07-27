import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { canonicalize, loadTool, parseXmlToTree } from "../src/index.js";

/**
 * Data-driven port of Galaxy's
 * test/unit/tool_util/tool_parsing/macro_expansion/test_macro_expansion.py.
 *
 * Each case is a directory under fixtures/macro-expansion/cases/ containing:
 *   tool.xml      — source to expand (required)
 *   *.xml imports — files <import>-ed by tool.xml
 *   expected.xml  — golden expansion (required unless `error` present)
 *   error         — presence marks an expected failure; non-empty text is the
 *                   exact exception message to assert
 *
 * The goldens are Galaxy's pretty-printed XML; we compare structurally
 * (whitespace-normalized tag/attr/text/child trees) rather than byte-for-byte,
 * so the TS expander need not reproduce minidom's serializer.
 */

const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures/macro-expansion/cases");

function caseNames(): string[] {
  return readdirSync(CASES_DIR)
    .filter((name) => existsSync(join(CASES_DIR, name, "tool.xml")))
    .sort();
}

describe("XML macro expansion", () => {
  const names = caseNames();
  it("has synced fixtures", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    const caseDir = join(CASES_DIR, name);
    const toolPath = join(caseDir, "tool.xml");
    const errorPath = join(caseDir, "error");

    if (existsSync(errorPath)) {
      const expectedMessage = readFileSync(errorPath, "utf-8").trim();
      it(`${name} (error)`, () => {
        let thrown: Error | null = null;
        try {
          loadTool(toolPath);
        } catch (e) {
          thrown = e as Error;
        }
        expect(thrown, "expansion should have raised").not.toBeNull();
        if (expectedMessage) {
          expect(thrown!.message).toBe(expectedMessage);
        }
      });
      continue;
    }

    it(name, () => {
      const actual = canonicalize(loadTool(toolPath));
      const expected = canonicalize(
        parseXmlToTree(readFileSync(join(caseDir, "expected.xml"), "utf-8")),
      );
      expect(actual).toEqual(expected);
    });
  }
});
