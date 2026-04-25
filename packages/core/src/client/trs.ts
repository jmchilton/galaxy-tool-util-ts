import { ToolFetchError } from "./toolshed.js";

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Subset of a TRS `ToolVersion` object as returned by Tool Shed's
 * `/api/ga4gh/trs/v2/tools/{id}/versions` endpoint. Only the fields we
 * actually consume downstream are typed strictly; the rest are kept as
 * unknown so unexpected nulls or new additions don't cause decode failures.
 */
export interface TRSToolVersion {
  /** TRS version id (e.g. `"0.74+galaxy0"`). */
  id: string;
  /** Display name, often `null` on Tool Shed. */
  name: string | null;
  /** Repository URL. */
  url: string;
  /** Declared descriptor types (e.g. `["GALAXY"]`). */
  descriptor_type: string[];
  /** Author list. */
  author: string[];
  [extra: string]: unknown;
}

function coerceTRSVersion(value: unknown, index: number): TRSToolVersion {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`TRS versions response: entries[${index}] must be an object`);
  }
  const v = value as Record<string, unknown>;

  if (typeof v.id !== "string") {
    throw new Error(`TRS versions response: entries[${index}].id must be a string`);
  }
  if (v.name !== null && typeof v.name !== "string") {
    throw new Error(`TRS versions response: entries[${index}].name must be a string or null`);
  }
  if (typeof v.url !== "string") {
    throw new Error(`TRS versions response: entries[${index}].url must be a string`);
  }
  if (!Array.isArray(v.descriptor_type) || v.descriptor_type.some((x) => typeof x !== "string")) {
    throw new Error(
      `TRS versions response: entries[${index}].descriptor_type must be a string array`,
    );
  }
  if (!Array.isArray(v.author) || v.author.some((x) => typeof x !== "string")) {
    throw new Error(`TRS versions response: entries[${index}].author must be a string array`);
  }

  return v as unknown as TRSToolVersion;
}

/**
 * Fetch the list of TRS tool versions for a given `trsToolId`
 * (`<owner>~<repo>~<toolId>` form). Returns the raw server order —
 * Tool Shed returns oldest first (the last entry is the newest).
 */
export async function getTRSToolVersions(
  toolshedUrl: string,
  trsToolId: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<TRSToolVersion[]> {
  const url = `${toolshedUrl}/api/ga4gh/trs/v2/tools/${encodeURIComponent(trsToolId)}/versions`;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new ToolFetchError(
      `TRS versions request to ${url} failed: ${(err as Error).message}`,
      url,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ToolFetchError(
      `TRS versions request to ${url} failed: ${response.status} ${body.slice(0, 200)}`,
      url,
      response.status,
    );
  }

  const json: unknown = await response.json();
  if (!Array.isArray(json)) {
    throw new ToolFetchError(
      `TRS versions response from ${url} was not an array`,
      url,
      response.status,
    );
  }
  try {
    return json.map(coerceTRSVersion);
  } catch (err) {
    throw new ToolFetchError(
      `TRS versions response from ${url} was malformed: ${(err as Error).message}`,
      url,
      response.status,
    );
  }
}

/**
 * Fetch the latest TRS tool version id. Returns `null` if the tool has no
 * published versions. Tool Shed returns versions oldest-first; the latest
 * is the last entry.
 */
export async function getLatestTRSToolVersion(
  toolshedUrl: string,
  trsToolId: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<string | null> {
  const versions = await getTRSToolVersions(toolshedUrl, trsToolId, fetcher);
  return versions.length > 0 ? versions[versions.length - 1].id : null;
}
