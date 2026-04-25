/**
 * Plain TypeScript types for Tool Shed `/api/repositories?q=` responses, plus a
 * one-way normalizer. Wire types stay snake_case to mirror the server.
 *
 * Differs from `ToolSearchHit` in shape and in ranking — the repository search
 * supports `category:` and `owner:` reserved keywords inside `q=`, and
 * popularity (`times_downloaded`) actively shifts ranking.
 */

import type { SearchResults } from "./toolshed-search.js";

export interface RepositorySearchHit {
  repository: {
    id: string;
    name: string;
    repo_owner_username: string;
    description: string | null;
    long_description: string | null;
    remote_repository_url: string | null;
    homepage_url: string | null;
    /** ISO date or null. Populated lazily by the server. */
    last_update: string | null;
    /** Human-formatted update timestamp (e.g. "2023-06-08 08:02 PM"). */
    full_last_updated: string | null;
    /** Comma-separated category slugs (e.g. `"sequence analysis,fastq manipulation"`). */
    categories: string | null;
    approved: boolean;
    times_downloaded: number;
  };
  /** Whoosh BM25 score (popularity-boosted). Higher is better. */
  score: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceCount(value: unknown, field: string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Tool Shed repo search response: \`${field}\` is not a finite number`);
    }
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new Error(
        `Tool Shed repo search response: \`${field}\` (${JSON.stringify(value)}) is not numeric`,
      );
    }
    return n;
  }
  throw new Error(
    `Tool Shed repo search response: \`${field}\` must be a number or numeric string`,
  );
}

function coerceOptionalString(value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`Tool Shed repo search response: ${path} must be a string or null`);
  }
  return value;
}

function coerceRepoHit(value: unknown, hitIndex: number): RepositorySearchHit {
  if (!isObject(value)) {
    throw new Error(`Tool Shed repo search response: hits[${hitIndex}] must be an object`);
  }
  const repo = value.repository;
  if (!isObject(repo)) {
    throw new Error(
      `Tool Shed repo search response: hits[${hitIndex}].repository must be an object`,
    );
  }
  const required: Array<keyof RepositorySearchHit["repository"]> = [
    "id",
    "name",
    "repo_owner_username",
  ];
  for (const key of required) {
    if (typeof repo[key] !== "string") {
      throw new Error(
        `Tool Shed repo search response: hits[${hitIndex}].repository.${String(key)} must be a string`,
      );
    }
  }
  if (typeof value.score !== "number" || !Number.isFinite(value.score)) {
    throw new Error(
      `Tool Shed repo search response: hits[${hitIndex}].score must be a finite number`,
    );
  }
  const approved = repo.approved;
  if (typeof approved !== "boolean") {
    throw new Error(
      `Tool Shed repo search response: hits[${hitIndex}].repository.approved must be a boolean`,
    );
  }
  const timesDownloaded = coerceCount(
    repo.times_downloaded,
    `hits[${hitIndex}].repository.times_downloaded`,
  );

  return {
    repository: {
      id: repo.id as string,
      name: repo.name as string,
      repo_owner_username: repo.repo_owner_username as string,
      description: coerceOptionalString(
        repo.description,
        `hits[${hitIndex}].repository.description`,
      ),
      long_description: coerceOptionalString(
        repo.long_description,
        `hits[${hitIndex}].repository.long_description`,
      ),
      remote_repository_url: coerceOptionalString(
        repo.remote_repository_url,
        `hits[${hitIndex}].repository.remote_repository_url`,
      ),
      homepage_url: coerceOptionalString(
        repo.homepage_url,
        `hits[${hitIndex}].repository.homepage_url`,
      ),
      last_update: coerceOptionalString(
        repo.last_update,
        `hits[${hitIndex}].repository.last_update`,
      ),
      full_last_updated: coerceOptionalString(
        repo.full_last_updated,
        `hits[${hitIndex}].repository.full_last_updated`,
      ),
      categories: coerceOptionalString(repo.categories, `hits[${hitIndex}].repository.categories`),
      approved,
      times_downloaded: timesDownloaded,
    },
    score: value.score,
  };
}

export function normalizeRepoSearchResults(raw: unknown): SearchResults<RepositorySearchHit> {
  if (!isObject(raw)) {
    throw new Error("Tool Shed repo search response: payload must be an object");
  }
  if (typeof raw.hostname !== "string") {
    throw new Error("Tool Shed repo search response: `hostname` must be a string");
  }
  if (!Array.isArray(raw.hits)) {
    throw new Error("Tool Shed repo search response: `hits` must be an array");
  }
  return {
    total_results: coerceCount(raw.total_results, "total_results"),
    page: coerceCount(raw.page, "page"),
    page_size: coerceCount(raw.page_size, "page_size"),
    hostname: raw.hostname,
    hits: raw.hits.map(coerceRepoHit),
  };
}
