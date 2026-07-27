import * as S from "effect/Schema";
import { ParsedTool } from "@galaxy-tool-util/schema";
import type { ParsedTool as ParsedToolType } from "@galaxy-tool-util/schema";

import type { ImportResolver } from "./macros.js";
import type { XmlToolSource } from "./tool-source.js";
import { loadXmlToolSource, xmlToolSourceFromString } from "./tool-source.js";

/**
 * Public XML tool-parsing entry — the TS mirror of Python's
 * ``parse_tool(get_tool_source(path))``. Assembles the `ParsedTool` fields off
 * an {@link XmlToolSource} and decodes them through the `ParsedTool` schema, so
 * a non-tool root (`<toolbox>`, …) is rejected here exactly as Python's pydantic
 * model rejects it (a missing `id`/`name` is not a valid `ParsedTool`).
 */
const decodeParsedTool = S.decodeUnknownSync(ParsedTool);

export function parsedToolFromSource(src: XmlToolSource): ParsedToolType {
  return decodeParsedTool({
    id: src.parseId(),
    version: src.parseVersion(),
    name: src.parseName(),
    description: src.parseDescription() || null,
    profile: src.parseProfile(),
    license: src.parseLicense(),
    edam_operations: src.parseEdamOperations(),
    edam_topics: src.parseEdamTopics(),
    xrefs: src.parseXrefs(),
    citations: src.parseCitations(),
    help: src.parseHelp(),
    inputs: src.parseInputs(),
    outputs: src.parseOutputs(),
  });
}

/** Parse XML tool text into a validated {@link ParsedToolType} (macros expanded via `importResolver`). */
export function parseXmlTool(text: string, importResolver: ImportResolver): ParsedToolType {
  return parsedToolFromSource(xmlToolSourceFromString(text, importResolver));
}

/** Load an XML tool file from disk and parse it into a validated {@link ParsedToolType}. */
export function loadXmlTool(path: string): ParsedToolType {
  return parsedToolFromSource(loadXmlToolSource(path));
}
