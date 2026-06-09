/**
 * Verifies the plain JSON Schema sibling of `GalaxyWorkflowDraftSchema`
 * (issue #108) — survives `JSON.stringify` and round-trips through Ajv
 * against known-good and known-bad fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import { galaxyWorkflowDraftJsonSchema } from "../src/workflow/json-schemas.js";

const Ajv2020 = Ajv2020Import as unknown as typeof Ajv2020Import.default;
const addFormats = addFormatsImport as unknown as typeof addFormatsImport.default;

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures", "workflows", "format2", "draft");
function loadFixture(name: string): unknown {
  return parseYaml(fs.readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("galaxyWorkflowDraftJsonSchema", () => {
  it("is a plain JSON object that survives JSON.stringify", () => {
    const serialized = JSON.stringify(galaxyWorkflowDraftJsonSchema);
    expect(serialized.length).toBeGreaterThan(0);
    expect(serialized).not.toBe("undefined");
    const reparsed = JSON.parse(serialized);
    expect(reparsed).toMatchObject({
      $schema: expect.stringContaining("2020-12"),
      type: "object",
    });
  });

  it("compiles under Ajv 2020-12", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(galaxyWorkflowDraftJsonSchema as object);
    expect(typeof validate).toBe("function");
  });

  it("accepts a known-good draft workflow fixture", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(galaxyWorkflowDraftJsonSchema as object);
    const draft = loadFixture("synthetic-draft-tool-step.gxwf.yml");
    const ok = validate(draft);
    if (!ok) {
      // surface the first few errors for debuggability
      console.error(validate.errors?.slice(0, 5));
    }
    expect(ok).toBe(true);
  });

  it("rejects a malformed draft (wrong `class` literal)", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(galaxyWorkflowDraftJsonSchema as object);
    const bad = { class: "NotADraft", steps: [] };
    expect(validate(bad)).toBe(false);
  });

  it("hoists repeated subschemas into $defs with only resolvable $refs", () => {
    const schema = galaxyWorkflowDraftJsonSchema as Record<string, unknown>;
    const defs = (schema.$defs ?? {}) as Record<string, unknown>;
    const names = new Set(Object.keys(defs));
    expect(names.size).toBeGreaterThan(0);
    let refs = 0;
    const walk = (n: unknown): void => {
      if (!n || typeof n !== "object") return;
      const ref = (n as Record<string, unknown>).$ref;
      if (typeof ref === "string") {
        refs++;
        const m = ref.match(/^#\/\$defs\/(.+)$/);
        expect(m, `unexpected $ref form: ${ref}`).not.toBeNull();
        expect(names.has(m![1]), `dangling $ref: ${ref}`).toBe(true);
      }
      for (const v of Object.values(n as Record<string, unknown>)) walk(v);
    };
    walk(schema);
    expect(refs).toBeGreaterThan(0);
  });

  it("stays compact so downstream packagers can vendor it verbatim", () => {
    // Pre-dedup the inlined draft schema was ~580 KB pretty-printed; the $ref
    // dedup brings it to well under 100 KB. Guard against re-bloat regressions.
    const pretty = JSON.stringify(galaxyWorkflowDraftJsonSchema, null, 2).length;
    expect(pretty).toBeLessThan(200_000);
  });
});
