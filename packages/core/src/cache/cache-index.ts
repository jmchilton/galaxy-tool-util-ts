import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CacheIndexEntry {
  tool_id: string;
  tool_version: string;
  source: string;
  source_url: string;
  cached_at: string;
}

export interface CacheIndexData {
  entries: Record<string, CacheIndexEntry>;
}

export class CacheIndex {
  private indexPath: string;
  private entries: Record<string, CacheIndexEntry> | null = null;

  constructor(readonly cacheDir: string) {
    this.indexPath = join(cacheDir, "index.json");
  }

  private getEntries(): Record<string, CacheIndexEntry> {
    if (this.entries === null) {
      this.entries = this.loadSync();
    }
    return this.entries;
  }

  private loadSync(): Record<string, CacheIndexEntry> {
    if (!existsSync(this.indexPath)) {
      return {};
    }
    try {
      const raw = readFileSync(this.indexPath, "utf-8");
      const data = JSON.parse(raw) as CacheIndexData;
      return data.entries ?? {};
    } catch (err) {
      console.debug(`Failed to load cache index (sync): ${err}`);
      return {};
    }
  }

  async load(): Promise<void> {
    if (!existsSync(this.indexPath)) {
      this.entries = {};
      return;
    }
    try {
      const raw = await readFile(this.indexPath, "utf-8");
      const data = JSON.parse(raw) as CacheIndexData;
      this.entries = data.entries ?? {};
    } catch (err) {
      console.debug(`Failed to load cache index: ${err}`);
      this.entries = {};
    }
  }

  async save(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const data: CacheIndexData = { entries: this.getEntries() };
    await writeFile(this.indexPath, JSON.stringify(data, null, 2));
  }

  async add(
    key: string,
    toolId: string,
    toolVersion: string,
    source: string,
    sourceUrl: string = "",
  ): Promise<void> {
    this.getEntries()[key] = {
      tool_id: toolId,
      tool_version: toolVersion,
      source,
      source_url: sourceUrl,
      cached_at: new Date().toISOString(),
    };
    await this.save();
  }

  async remove(key: string): Promise<void> {
    const entries = this.getEntries();
    if (key in entries) {
      delete entries[key];
      await this.save();
    }
  }

  has(key: string): boolean {
    return key in this.getEntries();
  }

  listAll(): Array<CacheIndexEntry & { cache_key: string }> {
    return Object.entries(this.getEntries()).map(([key, entry]) => ({
      cache_key: key,
      ...entry,
    }));
  }

  async clear(): Promise<void> {
    this.entries = {};
    await this.save();
  }
}
