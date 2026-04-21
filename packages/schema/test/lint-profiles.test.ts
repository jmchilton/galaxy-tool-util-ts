/**
 * Unit tests for the lint-profile catalog loader.
 *
 * Mirrors gxformat2/tests/test_lint_profiles.py.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  parseLintProfiles,
  lintProfilesById,
  rulesForProfile,
  iwcRuleIds,
  LINT_PROFILES_FILENAME,
} from "../src/workflow/lint-profiles.js";

const LINT_PROFILES_PATH = path.join(
  import.meta.dirname,
  "..",
  "src",
  "workflow",
  LINT_PROFILES_FILENAME,
);

const PROFILES = parseLintProfiles(fs.readFileSync(LINT_PROFILES_PATH, "utf-8"));

describe("lint profile catalog", () => {
  it("loads the three canonical profiles", () => {
    const byId = lintProfilesById(PROFILES);
    expect(byId.has("structural")).toBe(true);
    expect(byId.has("best-practices")).toBe(true);
    expect(byId.has("release")).toBe(true);
  });

  it("exposes rules for a named profile", () => {
    expect(rulesForProfile(PROFILES, "structural")).toContain("NativeStepKeyNotInteger");
    expect(rulesForProfile(PROFILES, "best-practices")).toContain("WorkflowMissingAnnotation");
    expect(rulesForProfile(PROFILES, "release")).toContain("WorkflowMissingRelease");
  });

  it("iwcRuleIds unions structural + best-practices + release", () => {
    const ids = iwcRuleIds(PROFILES);
    expect(ids.has("NativeStepKeyNotInteger")).toBe(true); // structural
    expect(ids.has("WorkflowMissingAnnotation")).toBe(true); // best-practices
    expect(ids.has("WorkflowMissingRelease")).toBe(true); // release
  });

  it("rulesForProfile throws on unknown profile id", () => {
    expect(() => rulesForProfile(PROFILES, "not-a-profile")).toThrow(/unknown lint profile/i);
  });

  it("parser tolerates unknown rule ids (no membership check)", () => {
    const synthetic = `
speculative:
  description: "Includes a not-yet-implemented rule id."
  rules:
    - NotYetImplementedRule
`;
    const parsed = parseLintProfiles(synthetic);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].rules).toEqual(["NotYetImplementedRule"]);
  });

  it("parser tolerates empty / null YAML", () => {
    expect(parseLintProfiles("")).toEqual([]);
    expect(parseLintProfiles("null")).toEqual([]);
  });
});
