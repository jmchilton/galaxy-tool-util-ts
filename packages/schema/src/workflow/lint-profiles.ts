/**
 * Lint profile catalog types and parser.
 *
 * Mirrors gxformat2/lint_profiles.py. Profiles group lint-rule IDs into
 * named sets (`structural`, `best-practices`, `release`). Unknown IDs are
 * tolerated — audit tooling compares against registered `Linter` subclasses
 * to flag unimplemented entries as INFO.
 *
 * The YAML file lives alongside this module at `./lint_profiles.yml`. This
 * module stays fs-free so src/ remains browser-compatible — callers read
 * the file themselves and hand the string to `parseLintProfiles`.
 */

import * as yaml from "yaml";

/** Relative path (from this module) to the profile catalog YAML. */
export const LINT_PROFILES_FILENAME = "lint_profiles.yml";

/** Canonical profile names whose union defines the IWC rule set. */
export const IWC_PROFILE_NAMES = ["structural", "best-practices", "release"] as const;

export interface LintProfile {
  id: string;
  description: string;
  rules: string[];
}

interface RawLintProfile {
  description?: string;
  rules: string[];
}

export function parseLintProfiles(yamlContent: string): LintProfile[] {
  const raw = (yaml.parse(yamlContent) ?? {}) as Record<string, RawLintProfile>;
  return Object.entries(raw).map(([id, body]) => ({
    id,
    description: body.description ?? "",
    rules: body.rules ?? [],
  }));
}

export function lintProfilesById(profiles: LintProfile[]): Map<string, LintProfile> {
  return new Map(profiles.map((p) => [p.id, p]));
}

export function rulesForProfile(profiles: LintProfile[], id: string): string[] {
  const profile = lintProfilesById(profiles).get(id);
  if (!profile) {
    throw new Error(`Unknown lint profile: ${id}`);
  }
  return profile.rules;
}

/** Union of rule ids across structural / best-practices / release profiles. */
export function iwcRuleIds(profiles: LintProfile[]): Set<string> {
  const byId = lintProfilesById(profiles);
  const ids = new Set<string>();
  for (const name of IWC_PROFILE_NAMES) {
    const profile = byId.get(name);
    if (profile) {
      for (const ruleId of profile.rules) ids.add(ruleId);
    }
  }
  return ids;
}
