import * as S from "effect/Schema";
import { ParsedTool } from "../models/parsed-tool.js";

/** Error thrown when fetching a tool from a remote source fails. */
export class ToolFetchError extends Error {
  readonly _tag = "ToolFetchError";
  constructor(
    message: string,
    /** The URL that was requested. */
    readonly url: string,
    /** HTTP status code, if the request reached the server. */
    readonly statusCode?: number,
  ) {
    super(message);
  }
}

/**
 * Fetch parsed tool metadata from a ToolShed instance via its TRS API.
 * @param toolshedUrl - Base URL of the ToolShed (e.g. `https://toolshed.g2.bx.psu.edu`)
 * @param trsToolId - TRS-style tool ID (e.g. `owner~repo~tool_name`)
 * @param toolVersion - Exact tool version string
 * @param fetcher - Custom fetch implementation (defaults to globalThis.fetch)
 */
export async function fetchFromToolShed(
  toolshedUrl: string,
  trsToolId: string,
  toolVersion: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ParsedTool> {
  const url = `${toolshedUrl}/api/tools/${trsToolId}/versions/${toolVersion}`;
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ToolFetchError(
      `Failed to fetch from ${url}: ${response.status} ${body.slice(0, 200)}`,
      url,
      response.status,
    );
  }
  const json = await response.json();
  return S.decodeUnknownSync(ParsedTool)(json);
}

/**
 * Fetch parsed tool metadata from a Galaxy instance via its API.
 * @param galaxyUrl - Base URL of the Galaxy instance (e.g. `https://usegalaxy.org`)
 * @param toolId - Full tool ID (e.g. `toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc`)
 * @param toolVersion - Tool version (optional, fetches latest if omitted)
 * @param fetcher - Custom fetch implementation (defaults to globalThis.fetch)
 */
export async function fetchFromGalaxy(
  galaxyUrl: string,
  toolId: string,
  toolVersion?: string | null,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ParsedTool> {
  const encodedId = encodeURIComponent(toolId);
  const params = toolVersion ? `?tool_version=${encodeURIComponent(toolVersion)}` : "";
  const url = `${galaxyUrl}/api/tools/${encodedId}/parsed${params}`;
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ToolFetchError(
      `Failed to fetch from Galaxy ${url}: ${response.status} ${body.slice(0, 200)}`,
      url,
      response.status,
    );
  }
  const json = await response.json();
  return S.decodeUnknownSync(ParsedTool)(json);
}
