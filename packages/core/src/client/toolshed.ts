import * as S from "@effect/schema/Schema";
import { ParsedTool } from "../models/parsed-tool.js";

export class ToolFetchError extends Error {
  readonly _tag = "ToolFetchError";
  constructor(
    message: string,
    readonly url: string,
    readonly statusCode?: number,
  ) {
    super(message);
  }
}

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
