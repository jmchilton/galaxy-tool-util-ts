/**
 * Inline GalaxyUserTool → ParsedTool conversion. Mirrors
 * `galaxy.tool_util.model_factory.parse_tool(YamlToolSource(repr))` for the
 * fields surfaced on the TS `ParsedTool`. See `./inputs.ts` and `./outputs.ts`
 * for the parameter / output trees.
 */

import type { ParsedTool, Citation, XrefDict, HelpContent } from "../schema/parsed-tool.js";

import { parseInputs } from "./inputs.js";
import { parseOutputs } from "./outputs.js";

export type InlineRepresentation = Record<string, unknown>;

export class InlineToolParseError extends Error {}

export function parseInlineTool(repr: InlineRepresentation): ParsedTool {
  if (!repr || typeof repr !== "object" || Array.isArray(repr)) {
    throw new InlineToolParseError("inline tool representation must be an object");
  }
  if (repr.class !== "GalaxyUserTool") {
    throw new InlineToolParseError(
      `inline tool representation must have class 'GalaxyUserTool' (got ${JSON.stringify(repr.class)})`,
    );
  }

  const id = typeof repr.id === "string" ? repr.id : "";
  const version = repr.version == null ? null : String(repr.version);
  const name = (typeof repr.name === "string" && repr.name) || id || "";
  const description = typeof repr.description === "string" ? repr.description : "";

  return {
    id,
    version,
    name,
    description: description === "" ? null : description,
    inputs: parseInputs(repr.inputs),
    outputs: parseOutputs(repr.outputs),
    citations: parseCitations(repr.citations),
    license: typeof repr.license === "string" ? repr.license : null,
    profile: parseProfile(repr.profile),
    edam_operations: parseStringList(repr.edam_operations),
    edam_topics: parseStringList(repr.edam_topics),
    xrefs: parseXrefs(repr.xrefs),
    help: parseHelp(repr.help),
  };
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

function parseProfile(raw: unknown): string | null {
  if (typeof raw === "string" && raw) return raw;
  if (typeof raw === "number") return String(raw);
  // Matches `YamlToolSource.parse_profile` default.
  return "24.2";
}

function parseCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  const out: Citation[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const type = typeof e.type === "string" ? e.type : null;
    const content = typeof e.content === "string" ? e.content : null;
    if (type && content !== null) out.push({ type, content });
  }
  return out;
}

function parseXrefs(raw: unknown): XrefDict[] {
  if (!Array.isArray(raw)) return [];
  const out: XrefDict[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const value = typeof e.value === "string" ? e.value : null;
    const type = typeof e.type === "string" ? e.type : null;
    // YamlToolSource skips xrefs without a `type`; mirror that here.
    if (value !== null && type) out.push({ value, type });
  }
  return out;
}

function parseHelp(raw: unknown): HelpContent | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    return { format: "markdown", content: raw };
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const e = raw as Record<string, unknown>;
    const content = typeof e.content === "string" ? e.content : null;
    if (content === null) return null;
    const format = typeof e.format === "string" ? e.format : "markdown";
    return { format, content };
  }
  return null;
}
