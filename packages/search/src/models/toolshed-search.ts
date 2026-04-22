/**
 * Plain TypeScript types for Tool Shed `/api/tools?q=` responses, plus a
 * one-way normalizer that coerces the server's stringified pagination numbers
 * and shape-checks the payload.
 *
 * Wire types stay snake_case to mirror the Tool Shed JSON. Downstream code
 * (`ToolSearchService`, Stage 3) flattens these into a camelCase
 * `NormalizedToolHit` model.
 *
 * Effect Schema is intentionally not used here: these payloads are one-way
 * deserialized from a trusted peer and immediately flattened, so the
 * bidirectional codec / diagnostics tree / composable transforms that justify
 * Effect Schema for user-authored content do not apply.
 */

/** A single hit inside a Tool Shed tool search response. */
export interface ToolSearchHit {
  tool: {
    /** Tool id local to its repository (e.g. `fastqc`). Not the full Galaxy tool id. */
    id: string;
    name: string;
    description: string | null;
    repo_name: string;
    repo_owner_username: string;
    /**
     * Tool version. Optional — current Tool Shed search payloads omit it.
     * See `TS_SEARCH_OVERHAUL_ISSUE.md` (P0) for the upstream patch.
     */
    version?: string;
    /**
     * Mercurial changeset revision the hit was indexed from. Optional for
     * the same reason as `version`.
     */
    changeset_revision?: string;
  };
  /** Indexed-field → matched-term map (e.g. `{ name: "fastqc", help: "fastqc" }`). */
  matched_terms: Record<string, string>;
  /** Whoosh BM25 score. Higher is better. */
  score: number;
}

/** Generic Tool Shed search response wrapper. */
export interface SearchResults<A> {
  total_results: number;
  page: number;
  page_size: number;
  /** Tool Shed base URL the response was served from. */
  hostname: string;
  hits: A[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceCount(value: unknown, field: string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Tool Shed search response: \`${field}\` is not a finite number`);
    }
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new Error(
        `Tool Shed search response: \`${field}\` (${JSON.stringify(value)}) is not numeric`,
      );
    }
    return n;
  }
  throw new Error(`Tool Shed search response: \`${field}\` must be a number or numeric string`);
}

function coerceMatchedTerms(value: unknown, hitIndex: number): Record<string, string> {
  if (!isObject(value)) {
    throw new Error(`Tool Shed search response: hits[${hitIndex}].matched_terms must be an object`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string") {
      throw new Error(
        `Tool Shed search response: hits[${hitIndex}].matched_terms[${JSON.stringify(k)}] must be a string`,
      );
    }
    out[k] = v;
  }
  return out;
}

function coerceToolHit(value: unknown, hitIndex: number): ToolSearchHit {
  if (!isObject(value)) {
    throw new Error(`Tool Shed search response: hits[${hitIndex}] must be an object`);
  }
  const tool = value.tool;
  if (!isObject(tool)) {
    throw new Error(`Tool Shed search response: hits[${hitIndex}].tool must be an object`);
  }

  const required: Array<keyof ToolSearchHit["tool"]> = [
    "id",
    "name",
    "repo_name",
    "repo_owner_username",
  ];
  for (const key of required) {
    if (typeof tool[key] !== "string") {
      throw new Error(
        `Tool Shed search response: hits[${hitIndex}].tool.${String(key)} must be a string`,
      );
    }
  }

  const description = tool.description;
  if (description !== null && typeof description !== "string" && description !== undefined) {
    throw new Error(
      `Tool Shed search response: hits[${hitIndex}].tool.description must be a string or null`,
    );
  }

  const version = tool.version;
  if (version !== undefined && typeof version !== "string") {
    throw new Error(`Tool Shed search response: hits[${hitIndex}].tool.version must be a string`);
  }
  const changeset = tool.changeset_revision;
  if (changeset !== undefined && typeof changeset !== "string") {
    throw new Error(
      `Tool Shed search response: hits[${hitIndex}].tool.changeset_revision must be a string`,
    );
  }

  if (typeof value.score !== "number" || !Number.isFinite(value.score)) {
    throw new Error(`Tool Shed search response: hits[${hitIndex}].score must be a finite number`);
  }

  const hit: ToolSearchHit = {
    tool: {
      id: tool.id as string,
      name: tool.name as string,
      description: (description ?? null) as string | null,
      repo_name: tool.repo_name as string,
      repo_owner_username: tool.repo_owner_username as string,
    },
    matched_terms: coerceMatchedTerms(value.matched_terms, hitIndex),
    score: value.score,
  };
  if (version !== undefined) hit.tool.version = version;
  if (changeset !== undefined) hit.tool.changeset_revision = changeset;
  return hit;
}

/**
 * Validate and normalize a raw Tool Shed `/api/tools?q=` response.
 *
 * Coerces stringified pagination numbers (`total_results`, `page`,
 * `page_size`) into JS numbers and shape-checks each hit. Throws a
 * descriptive `Error` identifying the offending field on malformed input;
 * the HTTP client (Stage 2) is responsible for wrapping network/transport
 * failures as `ToolFetchError`.
 */
export function normalizeToolSearchResults(raw: unknown): SearchResults<ToolSearchHit> {
  if (!isObject(raw)) {
    throw new Error("Tool Shed search response: payload must be an object");
  }
  if (typeof raw.hostname !== "string") {
    throw new Error("Tool Shed search response: `hostname` must be a string");
  }
  if (!Array.isArray(raw.hits)) {
    throw new Error("Tool Shed search response: `hits` must be an array");
  }
  return {
    total_results: coerceCount(raw.total_results, "total_results"),
    page: coerceCount(raw.page, "page"),
    page_size: coerceCount(raw.page_size, "page_size"),
    hostname: raw.hostname,
    hits: raw.hits.map(coerceToolHit),
  };
}
