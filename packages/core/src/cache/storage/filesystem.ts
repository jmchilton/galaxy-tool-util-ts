import { readFile, writeFile, mkdir, unlink, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { CacheStorage } from "./interface.js";

/**
 * Key used by CacheIndex to store the index metadata.
 * Mapped to "index.json" on disk for backward compatibility with existing caches.
 */
const INDEX_KEY = "__index__";
const INDEX_FILENAME = "index.json";

/**
 * Node.js filesystem-backed CacheStorage.
 * Stores each entry as `<cacheDir>/<key>.json`.
 * The internal `__index__` key maps to `index.json` for backward compatibility.
 */
export class FilesystemCacheStorage implements CacheStorage {
  constructor(readonly cacheDir: string) {}

  private keyToPath(key: string): string {
    if (key === INDEX_KEY) return join(this.cacheDir, INDEX_FILENAME);
    return join(this.cacheDir, `${key}.json`);
  }

  async load(key: string): Promise<unknown | null> {
    const path = this.keyToPath(key);
    if (!existsSync(path)) return null;
    try {
      const raw = await readFile(path, "utf-8");
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  async save(key: string, data: unknown): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(this.keyToPath(key), JSON.stringify(data, null, 2));
  }

  async delete(key: string): Promise<void> {
    const path = this.keyToPath(key);
    if (existsSync(path)) await unlink(path);
  }

  async list(): Promise<string[]> {
    if (!existsSync(this.cacheDir)) return [];
    const files = await readdir(this.cacheDir);
    return files
      .filter((f) => f.endsWith(".json") && f !== INDEX_FILENAME)
      .map((f) => f.slice(0, -5));
  }

  async saveAll(entries: ReadonlyArray<[string, unknown]>): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    for (const [key, data] of entries) {
      await writeFile(this.keyToPath(key), JSON.stringify(data, null, 2));
    }
  }
}
