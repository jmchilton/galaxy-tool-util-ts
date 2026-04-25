import { ToolFetchError } from "@galaxy-tool-util/core";

const REQUEST_TIMEOUT_MS = 30_000;

export interface ToolRevisionsOptions {
  owner: string;
  repo: string;
  toolId: string;
  /** When set, restrict matches to revisions whose tool carries this exact version. */
  version?: string;
  fetcher?: typeof fetch;
}

export interface ToolRevisionMatch {
  /** Changeset hash (e.g. `"e28c965eeed4"`). */
  changesetRevision: string;
  /** The tool's `version` attribute in that revision. */
  toolVersion: string;
  /** Position in `get_ordered_installable_revisions` (0-based). Lower = older. */
  order: number;
}

interface ToolshedRepo {
  id: string;
}

interface ToolshedRevisionTool {
  id?: unknown;
  version?: unknown;
}

interface ToolshedRevisionMetadata {
  tools?: ToolshedRevisionTool[] | null;
}

async function fetchJson(
  url: string,
  fetcher: typeof fetch,
  { allow404 = false }: { allow404?: boolean } = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new ToolFetchError(`Tool Shed request to ${url} failed: ${(err as Error).message}`, url);
  }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ToolFetchError(
      `Tool Shed request to ${url} failed: ${response.status} ${body.slice(0, 200)}`,
      url,
      response.status,
    );
  }
  return response.json();
}

/**
 * Resolve `(owner, repo, toolId[, version])` to the list of changeset revisions
 * that publish that tool, ordered oldest → newest via
 * `/api/repositories/get_ordered_installable_revisions`.
 *
 * Returns `[]` when the repo is absent, when no revisions contain the tool, or
 * when `version` is supplied and no revision publishes that exact version.
 *
 * Sharp edges (Tool Shed side):
 *   - Version strings are not monotonic — two changesets can legally publish
 *     the same `version` with different content.
 *   - The `metadata` payload can be large for repos with many revisions; one
 *     call is issued per resolution, so cache across a skill session.
 */
export async function getToolRevisions(
  toolshedUrl: string,
  opts: ToolRevisionsOptions,
): Promise<ToolRevisionMatch[]> {
  const fetcher = opts.fetcher ?? globalThis.fetch;
  const { owner, repo, toolId, version } = opts;

  const repoListUrl = `${toolshedUrl}/api/repositories?${new URLSearchParams({ owner, name: repo })}`;
  const repoList = (await fetchJson(repoListUrl, fetcher)) as unknown;
  if (!Array.isArray(repoList) || repoList.length === 0) return [];
  const repoRow = repoList[0] as ToolshedRepo;
  if (typeof repoRow.id !== "string") {
    throw new ToolFetchError(
      `Tool Shed repository listing from ${repoListUrl} missing string id`,
      repoListUrl,
    );
  }

  const [metadata, ordered] = await Promise.all([
    fetchJson(
      `${toolshedUrl}/api/repositories/${encodeURIComponent(repoRow.id)}/metadata?downloadable_only=true`,
      fetcher,
    ) as Promise<Record<string, ToolshedRevisionMetadata>>,
    fetchJson(
      `${toolshedUrl}/api/repositories/get_ordered_installable_revisions?${new URLSearchParams({ owner, name: repo })}`,
      fetcher,
    ) as Promise<string[]>,
  ]);

  if (!metadata || typeof metadata !== "object") return [];
  const orderIndex = new Map<string, number>(
    Array.isArray(ordered) ? ordered.map((h, i) => [h, i]) : [],
  );

  const matches: ToolRevisionMatch[] = [];
  for (const [key, meta] of Object.entries(metadata)) {
    const colon = key.indexOf(":");
    const hash = colon >= 0 ? key.slice(colon + 1) : key;
    const tools = meta?.tools;
    if (!Array.isArray(tools)) continue;
    for (const t of tools) {
      if (t.id !== toolId) continue;
      const tv = typeof t.version === "string" ? t.version : "";
      if (version !== undefined && tv !== version) continue;
      const order = orderIndex.get(hash) ?? Number.MAX_SAFE_INTEGER;
      matches.push({ changesetRevision: hash, toolVersion: tv, order });
      break;
    }
  }

  // Revisions not present in ordered list sink to the end but remain grouped.
  matches.sort((a, b) => a.order - b.order);
  return matches;
}
