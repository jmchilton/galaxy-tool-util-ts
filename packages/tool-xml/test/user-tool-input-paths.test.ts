/**
 * The `inputs.*` member path check must accept Galaxy's own YAML tools, which
 * run in Galaxy's functional tests. The fixtures are synced from Galaxy's
 * `test/functional/tools/`.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { checkInputPaths } from "@galaxy-tool-util/schema";

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), "fixtures/tool_parsing/tools");
const YAML_TOOLS = readdirSync(TOOLS).filter((f) => f.endsWith(".yml"));

describe("inputs.* member paths in Galaxy's YAML functional tools", () => {
  it("covers the synced YAML tools", () => {
    expect(YAML_TOOLS.length).toBeGreaterThan(0);
  });

  it.each(YAML_TOOLS)("%s has no findings", (file) => {
    const doc = parse(readFileSync(join(TOOLS, file), "utf-8")) as Record<string, unknown>;
    expect(checkInputPaths(doc, { undeclaredRoots: true })).toEqual([]);
  });
});
