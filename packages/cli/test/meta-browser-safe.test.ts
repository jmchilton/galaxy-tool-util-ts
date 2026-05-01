/**
 * Enforces the import boundary that makes `@galaxy-tool-util/cli/meta`
 * browser-safe.
 *
 * Walks every file under `src/meta/` and asserts each import target is
 * either:
 *   - a relative path that resolves inside `src/meta/`, or
 *   - on the explicit allowlist (currently empty — meta is pure data + types).
 *
 * Adding `commander`, `node:fs`, or any other node-only import to a file
 * under `src/meta/` will fail this test.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const metaRoot = resolve(__dirname, "../src/meta");

/** Packages browser-safe enough that meta may import them. Empty by design. */
const ALLOWED_EXTERNAL: ReadonlySet<string> = new Set([]);

const STATIC_IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"]*?from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".ts")) {
      yield full;
    }
  }
}

function externalPackageName(spec: string): string | undefined {
  if (spec.startsWith(".") || spec.startsWith("/")) return undefined;
  if (spec.startsWith("@")) {
    const [scope, name] = spec.split("/");
    return name ? `${scope}/${name}` : scope;
  }
  return spec.split("/")[0];
}

describe("@galaxy-tool-util/cli/meta browser-safety boundary", () => {
  it("contains only relative or allowlisted imports", async () => {
    const violations: string[] = [];

    for await (const file of walk(metaRoot)) {
      const source = await readFile(file, "utf8");
      const rel = relative(metaRoot, file);

      const allMatches = [
        ...source.matchAll(STATIC_IMPORT_RE),
        ...source.matchAll(DYNAMIC_IMPORT_RE),
        ...source.matchAll(REQUIRE_RE),
      ];
      for (const match of allMatches) {
        const spec = match[1];
        const external = externalPackageName(spec);

        if (external !== undefined) {
          if (!ALLOWED_EXTERNAL.has(external)) {
            violations.push(`${rel}: imports external package "${external}" (spec: "${spec}")`);
          }
          continue;
        }

        const resolved = resolve(dirname(file), spec);
        const metaRootWithSep = metaRoot + "/";
        if (!resolved.startsWith(metaRootWithSep) && resolved !== metaRoot) {
          violations.push(
            `${rel}: relative import "${spec}" escapes src/meta/ (resolves to ${resolved})`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("re-exports populated commander metadata", async () => {
    const meta = await import("../src/meta/index.js");
    expect(meta.gxwfCliMeta.name).toBe("gxwf");
    expect(meta.gxwfCliMeta.commands.length).toBeGreaterThan(0);
    expect(meta.galaxyToolCacheCliMeta.name).toBe("galaxy-tool-cache");
    expect(meta.galaxyToolCacheCliMeta.commands.length).toBeGreaterThan(0);

    const validate = meta.gxwfCliMeta.commands.find((c) => c.name === "validate");
    expect(validate?.options.some((o) => o.flags === "--json")).toBe(true);
    expect(validate?.args[0]?.name).toBe("file");
  });
});
