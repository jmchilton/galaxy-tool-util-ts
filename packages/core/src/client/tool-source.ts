import type { ToolSourceDocument } from "../tool-source.js";
import { ToolFetchError } from "./toolshed.js";

async function fetchSource(url: string, fetcher: typeof fetch): Promise<ToolSourceDocument> {
  const response = await fetcher(url, {
    headers: { Accept: "text/plain, application/xml, application/yaml, application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ToolFetchError(
      `Failed to fetch tool source from ${url}: ${response.status} ${body.slice(0, 200)}`,
      url,
      response.status,
    );
  }
  const contents = await response.text();
  const header = response.headers.get("language")?.toLowerCase();
  const language =
    header === "xml" || header === "yaml" || header === "json" || header === "cwl"
      ? header
      : "text";
  return { contents, language, macrosExpanded: language === "xml" };
}

/** Fetch the expanded wrapper selected by tool version, without changeset selection. */
export function fetchToolSourceFromToolShed(
  toolshedUrl: string,
  trsToolId: string,
  toolVersion: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ToolSourceDocument> {
  return fetchSource(
    `${toolshedUrl.replace(/\/$/, "")}/api/tools/${encodeURIComponent(trsToolId)}/versions/${encodeURIComponent(toolVersion)}/tool_source`,
    fetcher,
  );
}

/** Galaxy may restrict source display to administrators, depending on its configuration. */
export function fetchToolSourceFromGalaxy(
  galaxyUrl: string,
  toolId: string,
  toolVersion?: string | null,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ToolSourceDocument> {
  const params = toolVersion ? `?tool_version=${encodeURIComponent(toolVersion)}` : "";
  return fetchSource(
    `${galaxyUrl.replace(/\/$/, "")}/api/tools/${encodeURIComponent(toolId)}/raw_tool_source${params}`,
    fetcher,
  );
}
