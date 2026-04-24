import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import type { ExpectationEntry } from "./dict-verify-each.js";

export interface ConnectionFixture {
  stem: string;
  path: string;
  workflow: Record<string, unknown>;
  expected: ExpectationEntry[] | null;
}

function fixtureStem(filename: string): string {
  return filename.replace(/\.gxwf\.yml$/, "");
}

export function loadConnectionFixtures(dir: string): ConnectionFixture[] {
  const expectedDir = join(dir, "expected");
  const names = readdirSync(dir)
    .filter((f) => f.endsWith(".gxwf.yml"))
    .sort();
  return names.map((name) => {
    const stem = fixtureStem(name);
    const path = join(dir, name);
    const workflow = parseYaml(readFileSync(path, "utf-8")) as Record<string, unknown>;
    const expectedPath = join(expectedDir, name);
    let expected: ExpectationEntry[] | null = null;
    try {
      expected = parseYaml(readFileSync(expectedPath, "utf-8")) as ExpectationEntry[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    return { stem, path, workflow, expected };
  });
}
