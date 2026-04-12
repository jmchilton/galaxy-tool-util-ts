import type { CacheStorage } from "./storage/interface.js";

/** Reserved storage key for the index metadata object. */
const INDEX_KEY = "__index__";

/** Metadata for a single cached tool entry. */
export interface CacheIndexEntry {
  tool_id: string;
  tool_version: string;
  /** How the tool was fetched: "api" (ToolShed), "galaxy", or "local". */
  source: string;
  source_url: string;
  /** ISO 8601 timestamp of when the tool was cached. */
  cached_at: string;
}

/** Serialized cache index structure. */
export interface CacheIndexData {
  entries: Record<string, CacheIndexEntry>;
}

/**
 * Manages the cache index that tracks metadata about cached tools.
 * Backed by a {@link CacheStorage} — works on both filesystem (Node.js) and
 * IndexedDB (browser/Web Worker).
 *
 * Call `await load()` before using `has()` or `listAll()` if you need
 * the persisted state. ToolCache calls load() automatically on first use.
 */
export class CacheIndex {
  private entries: Record<string, CacheIndexEntry> = {};
  private loaded = false;

  constructor(private readonly storage: CacheStorage) {}

  async load(): Promise<void> {
    const data = (await this.storage.load(INDEX_KEY)) as CacheIndexData | null;
    this.entries = data?.entries ?? {};
    this.loaded = true;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  private async save(): Promise<void> {
    const data: CacheIndexData = { entries: this.entries };
    await this.storage.save(INDEX_KEY, data);
  }

  async add(
    key: string,
    toolId: string,
    toolVersion: string,
    source: string,
    sourceUrl: string = "",
  ): Promise<void> {
    await this.ensureLoaded();
    this.entries[key] = {
      tool_id: toolId,
      tool_version: toolVersion,
      source,
      source_url: sourceUrl,
      cached_at: new Date().toISOString(),
    };
    await this.save();
  }

  async remove(key: string): Promise<void> {
    await this.ensureLoaded();
    if (key in this.entries) {
      delete this.entries[key];
      await this.save();
    }
  }

  async has(key: string): Promise<boolean> {
    await this.ensureLoaded();
    return key in this.entries;
  }

  async listAll(): Promise<Array<CacheIndexEntry & { cache_key: string }>> {
    await this.ensureLoaded();
    return Object.entries(this.entries).map(([key, entry]) => ({
      cache_key: key,
      ...entry,
    }));
  }

  async clear(): Promise<void> {
    this.entries = {};
    this.loaded = true;
    await this.save();
  }
}
