import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import * as S from "@effect/schema/Schema";

import {
  parseToolshedToolId,
  cacheKey,
} from "../src/cache/index.js";
import { ParsedTool } from "../src/models/parsed-tool.js";

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
    description?: string;
    input_count: number;
    input_names: string[];
    input_types: string[];
    output_count: number;
    output_names: string[];
    citation_count?: number;
    edam_operations?: string[];
  };
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
    input_count: number;
    input_names: string[];
    input_types: string[];
    output_count: number;
    output_names: string[];
    edam_operations?: string[];
  };
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
  toolshed_tools: ToolshedEntry[];
  stock_tools: StockEntry[];
  unparseable_tool_ids: UnparseableEntry[];
  version_from_separate_arg: VersionSeparateEntry[];
}

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

const manifest: Manifest = parseYaml(readFileSync(MANIFEST_PATH, "utf-8"));

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

      it("computes correct cache key", () => {
        const key = cacheKey(
          entry.expected_url,
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

        if (exp.citation_count !== undefined) {
          expect(tool.citations).toHaveLength(exp.citation_count);
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

      it("computes correct cache key", () => {
        const key = cacheKey(
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

      it("computes same cache key with separate version", () => {
        const key = cacheKey(
          entry.expected_url,
          entry.expected_trs_id,
          entry.expected_version,
        );
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

describe("Golden cache integrity", () => {
  it("all golden JSON files decode as valid ParsedTool", () => {
    const indexRaw = JSON.parse(
      readFileSync(join(CACHE_DIR, "index.json"), "utf-8"),
    );
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
    const indexRaw = JSON.parse(
      readFileSync(join(CACHE_DIR, "index.json"), "utf-8"),
    );
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
});
