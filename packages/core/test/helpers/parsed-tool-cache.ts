import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import * as S from "effect/Schema";

import { ParsedTool } from "@galaxy-tool-util/schema";

export type ParsedToolT = S.Schema.Type<typeof ParsedTool>;

export function loadParsedToolCache(dir: string): Map<string, ParsedToolT> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "parsed_tools.sha256");
  const cache = new Map<string, ParsedToolT>();
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf-8"));
    const tool = S.decodeUnknownSync(ParsedTool)(raw);
    cache.set(basename(file, ".json"), tool);
  }
  return cache;
}
