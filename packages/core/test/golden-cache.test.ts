import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import * as S from "effect/Schema";

import { parseToolshedToolId, cacheKey } from "../src/cache/index.js";
import { ParsedTool } from "../src/models/parsed-tool.js";

const SUPPORTED_FORMAT_VERSION = 1;

const FIXTURES_DIR = join(__dirname, "fixtures", "golden");
const MANIFEST_PATH = join(FIXTURES_DIR, "cache_golden.yaml");
const CACHE_DIR = join(FIXTURES_DIR, "cache_golden");

interface ToolshedEntry {
  tool_id: string;
  expected_url: string;
  expected_trs_id: string;
  expected_version: string;
  expected_cache_key: string;
  expected_tool: {
    name: string;
    id: string;
    description?: string | null;
    input_count: number;
    input_names: string[];
    input_types: string[];
    output_count: number;
    output_names: string[];
    citation_count?: number;
    edam_operations?: string[];
  };
  expected_nested_structure?: Record<string, string>;
}

interface StockEntry {
  tool_id: string;
  tool_version: string;
  default_toolshed_url: string;
  expected_trs_id: string;
  expected_version: string;
  expected_cache_key: string;
  expected_tool: {
    name: string;
    id: string;
    description?: string | null;
    input_count: number;
    input_names: string[];
    input_types: string[];
    output_count: number;
    output_names: string[];
    edam_operations?: string[];
  };
  expected_nested_structure?: Record<string, string>;
}

interface UnparseableEntry {
  tool_id: string;
}

interface VersionSeparateEntry {
  tool_id: string;
  tool_version: string;
  expected_url: string;
  expected_trs_id: string;
  expected_version: string;
  expected_cache_key: string;
  expected_tool: {
    name: string;
    id: string;
  };
}

interface Manifest {
  format_version: number;
  toolshed_tools: ToolshedEntry[];
  stock_tools: StockEntry[];
  unparseable_tool_ids: UnparseableEntry[];
  version_from_separate_arg: VersionSeparateEntry[];
}

// --- Helpers ---

function loadGoldenTool(key: string): unknown {
  const path = join(CACHE_DIR, `${key}.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function extractInputNames(inputs: unknown[]): string[] {
  return inputs.map((inp: any) => inp.name);
}

function extractInputTypes(inputs: unknown[]): string[] {
  return inputs.map((inp: any) => inp.parameter_type);
}

function extractOutputNames(outputs: unknown[]): string[] {
  return outputs.map((out: any) => out.name);
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Walk a ParsedTool input tree to resolve a dotted path to a parameter type.
 * Mirrors Python's _resolve_path in test_tool_caching_golden.py.
 *
 * Path segments:
 * - gx_repeat/gx_section: segment is a child parameter name
 * - gx_conditional: first segment after the conditional is the test param name
 *   OR a when-branch discriminator value, then remaining segments resolve within that branch
 */
function resolvePath(inputs: unknown[], path: string): string | null {
  const parts = path.split(".");
  let currentInputs = inputs;

  let i = 0;
  while (i < parts.length) {
    const segment = parts[i];
    const param = currentInputs.find((p: any) => p.name === segment) as any;
    if (!param) return null;

    // Last segment — return its type
    if (i === parts.length - 1) {
      return param.parameter_type;
    }

    const ptype: string = param.parameter_type;
    if (ptype === "gx_conditional") {
      const nextSeg = parts[i + 1];
      // Could be the test parameter name
      if (param.test_parameter?.name === nextSeg) {
        if (i + 1 === parts.length - 1) {
          return param.test_parameter.parameter_type;
        }
        return null; // can't go deeper into a test param
      }
      // Otherwise it's a when-branch discriminator
      const whenBranch = param.whens?.find((w: any) => String(w.discriminator) === nextSeg);
      if (!whenBranch) return null;
      currentInputs = whenBranch.parameters;
      i += 2; // skip conditional name + discriminator
      continue;
    } else if (ptype === "gx_repeat" || ptype === "gx_section") {
      currentInputs = param.parameters;
      i += 1;
      continue;
    } else {
      return null;
    }
  }
  return null;
}

// --- Load manifest ---

const manifest: Manifest = parseYaml(readFileSync(MANIFEST_PATH, "utf-8"));

describe("Golden cache manifest", () => {
  it("has supported format_version", () => {
    expect(manifest.format_version).toBe(SUPPORTED_FORMAT_VERSION);
  });
});

describe("Golden cache contract — toolshed tools", () => {
  for (const entry of manifest.toolshed_tools) {
    describe(entry.tool_id, () => {
      it("parses tool ID correctly", () => {
        const parsed = parseToolshedToolId(entry.tool_id);
        expect(parsed).not.toBeNull();
        expect(parsed!.toolshedUrl).toBe(entry.expected_url);
        expect(parsed!.trsToolId).toBe(entry.expected_trs_id);
        expect(parsed!.toolVersion).toBe(entry.expected_version);
      });

      it("computes correct cache key", async () => {
        const key = await cacheKey(entry.expected_url, entry.expected_trs_id, entry.expected_version);
        expect(key).toBe(entry.expected_cache_key);
      });

      it("golden JSON decodes as valid ParsedTool", () => {
        const raw = loadGoldenTool(entry.expected_cache_key);
        const tool = S.decodeUnknownSync(ParsedTool)(raw);
        expect(tool.name).toBe(entry.expected_tool.name);
        expect(tool.id).toBe(entry.expected_tool.id);
      });

      it("matches expected tool metadata", () => {
        const raw = loadGoldenTool(entry.expected_cache_key);
        const tool = S.decodeUnknownSync(ParsedTool)(raw);
        const exp = entry.expected_tool;

        expect(tool.inputs).toHaveLength(exp.input_count);
        expect(extractInputNames(tool.inputs)).toEqual(exp.input_names);
        expect(extractInputTypes(tool.inputs)).toEqual(exp.input_types);
        expect(tool.outputs).toHaveLength(exp.output_count);
        expect(extractOutputNames(tool.outputs)).toEqual(exp.output_names);

        if (exp.citation_count !== undefined) {
          expect(tool.citations).toHaveLength(exp.citation_count);
        }
        if (exp.description !== undefined) {
          expect(tool.description).toBe(exp.description);
        }
      });
    });
  }
});

describe("Golden cache contract — stock tools", () => {
  for (const entry of manifest.stock_tools) {
    describe(entry.tool_id, () => {
      it("is not parseable as toolshed tool", () => {
        expect(parseToolshedToolId(entry.tool_id)).toBeNull();
      });

      it("computes correct cache key", async () => {
        const key = await cacheKey(
          entry.default_toolshed_url,
          entry.expected_trs_id,
          entry.expected_version,
        );
        expect(key).toBe(entry.expected_cache_key);
      });

      it("golden JSON decodes as valid ParsedTool", () => {
        const raw = loadGoldenTool(entry.expected_cache_key);
        const tool = S.decodeUnknownSync(ParsedTool)(raw);
        expect(tool.name).toBe(entry.expected_tool.name);
        expect(tool.id).toBe(entry.expected_tool.id);
      });

      it("matches expected tool metadata", () => {
        const raw = loadGoldenTool(entry.expected_cache_key);
        const tool = S.decodeUnknownSync(ParsedTool)(raw);
        const exp = entry.expected_tool;

        expect(tool.inputs).toHaveLength(exp.input_count);
        expect(extractInputNames(tool.inputs)).toEqual(exp.input_names);
        expect(extractInputTypes(tool.inputs)).toEqual(exp.input_types);
        expect(tool.outputs).toHaveLength(exp.output_count);
        expect(extractOutputNames(tool.outputs)).toEqual(exp.output_names);

        if (exp.edam_operations !== undefined) {
          expect(tool.edam_operations).toEqual(exp.edam_operations);
        }
        if (exp.description !== undefined) {
          expect(tool.description).toBe(exp.description);
        }
      });
    });
  }
});

describe("Golden cache contract — unparseable tool IDs", () => {
  for (const entry of manifest.unparseable_tool_ids) {
    it(`parseToolshedToolId("${entry.tool_id}") returns null`, () => {
      expect(parseToolshedToolId(entry.tool_id)).toBeNull();
    });
  }
});

describe("Golden cache contract — version from separate arg", () => {
  for (const entry of manifest.version_from_separate_arg) {
    describe(entry.tool_id, () => {
      it("parses tool ID without version", () => {
        const parsed = parseToolshedToolId(entry.tool_id);
        expect(parsed).not.toBeNull();
        expect(parsed!.toolshedUrl).toBe(entry.expected_url);
        expect(parsed!.trsToolId).toBe(entry.expected_trs_id);
        expect(parsed!.toolVersion).toBeNull();
      });

      it("computes same cache key with separate version", async () => {
        const key = await cacheKey(entry.expected_url, entry.expected_trs_id, entry.expected_version);
        expect(key).toBe(entry.expected_cache_key);
      });

      it("golden JSON decodes and matches", () => {
        const raw = loadGoldenTool(entry.expected_cache_key);
        const tool = S.decodeUnknownSync(ParsedTool)(raw);
        expect(tool.name).toBe(entry.expected_tool.name);
        expect(tool.id).toBe(entry.expected_tool.id);
      });
    });
  }
});

describe("Golden cache contract — nested parameter structure", () => {
  const allEntries = [...manifest.toolshed_tools, ...manifest.stock_tools].filter(
    (e) => e.expected_nested_structure,
  );

  for (const entry of allEntries) {
    describe(entry.tool_id, () => {
      const raw = loadGoldenTool(entry.expected_cache_key);
      const tool = S.decodeUnknownSync(ParsedTool)(raw);

      for (const [path, expectedType] of Object.entries(entry.expected_nested_structure!)) {
        it(`${path} → ${expectedType}`, () => {
          const actualType = resolvePath(tool.inputs, path);
          expect(actualType).not.toBeNull();
          expect(actualType).toBe(expectedType);
        });
      }
    });
  }

  it("bogus paths return null", () => {
    const entry = manifest.toolshed_tools[0];
    const raw = loadGoldenTool(entry.expected_cache_key);
    const tool = S.decodeUnknownSync(ParsedTool)(raw);
    for (const bogus of [
      "nonexistent",
      "input_file.nonexistent",
      "results.software_cond.fake_when.x",
    ]) {
      expect(resolvePath(tool.inputs, bogus)).toBeNull();
    }
  });
});

describe("Golden cache integrity", () => {
  it("all golden JSON files decode as valid ParsedTool", () => {
    const indexRaw = JSON.parse(readFileSync(join(CACHE_DIR, "index.json"), "utf-8"));
    const keys = Object.keys(indexRaw.entries);
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      const raw = loadGoldenTool(key);
      const tool = S.decodeUnknownSync(ParsedTool)(raw);
      expect(tool.id).toBeTruthy();
      expect(tool.name).toBeTruthy();
    }
  });

  it("index entries match manifest cache keys", () => {
    const indexRaw = JSON.parse(readFileSync(join(CACHE_DIR, "index.json"), "utf-8"));
    const indexKeys = new Set(Object.keys(indexRaw.entries));

    const manifestKeys = new Set<string>();
    for (const entry of manifest.toolshed_tools) {
      manifestKeys.add(entry.expected_cache_key);
    }
    for (const entry of manifest.stock_tools) {
      manifestKeys.add(entry.expected_cache_key);
    }

    for (const key of manifestKeys) {
      expect(indexKeys.has(key)).toBe(true);
    }
  });

  it("checksums.json matches actual file hashes", () => {
    const checksums = JSON.parse(readFileSync(join(CACHE_DIR, "checksums.json"), "utf-8"));

    // Verify manifest hash
    const manifestHash = sha256File(MANIFEST_PATH);
    expect(checksums.manifest_sha256).toBe(manifestHash);

    // Verify each golden file hash
    for (const [fname, expectedHash] of Object.entries(checksums.files)) {
      const actualHash = sha256File(join(CACHE_DIR, fname));
      expect(actualHash).toBe(expectedHash);
    }
  });
});
