import { readFile, writeFile, mkdir, unlink, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { CacheStorage } from "./interface.js";
import { isToolSourceDocument, type ToolSourceDocument } from "../../tool-source.js";

/**
 * Key used by CacheIndex to store the index metadata.
 * Mapped to "index.json" on disk for backward compatibility with existing caches.
 */
const INDEX_KEY = "__index__";
const INDEX_FILENAME = "index.json";

/**
 * Node.js filesystem-backed CacheStorage.
 * Stores parsed entries as `<cacheDir>/<key>.json` and wrapper text as
 * `<key>.source`, with format metadata in `<key>.source.json`.
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
    for (const path of [this.keyToPath(key), ...this.sourcePaths(key)]) {
      try {
        await unlink(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
  }

  private sourcePaths(key: string): [string, string] {
    return [join(this.cacheDir, `${key}.source`), join(this.cacheDir, `${key}.source.json`)];
  }

  async loadSource(key: string): Promise<ToolSourceDocument | null> {
    const [sourcePath, metadataPath] = this.sourcePaths(key);
    try {
      const contents = await readFile(sourcePath, "utf-8");
      const metadata: unknown = JSON.parse(await readFile(metadataPath, "utf-8"));
      const source = { ...(metadata as object), contents };
      return isToolSourceDocument(source) ? source : null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT" || err instanceof SyntaxError)
        return null;
      throw err;
    }
  }

  async saveSource(key: string, source: ToolSourceDocument): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const [sourcePath, metadataPath] = this.sourcePaths(key);
    const { contents, ...metadata } = source;
    await writeFile(sourcePath, contents, "utf-8");
    await writeFile(metadataPath, JSON.stringify(metadata));
  }

  async list(): Promise<string[]> {
    if (!existsSync(this.cacheDir)) return [];
    const files = await readdir(this.cacheDir);
    return [
      ...new Set(
        files
          .filter(
            (f) =>
              (f.endsWith(".json") || f.endsWith(".source")) &&
              f !== INDEX_FILENAME &&
              !f.endsWith(".source.json"),
          )
          .map((f) => (f.endsWith(".source") ? f.slice(0, -7) : f.slice(0, -5))),
      ),
    ];
  }

  async stat(key: string): Promise<{ sizeBytes: number; mtime?: string } | null> {
    let sizeBytes = 0;
    let mtime: string | undefined;
    for (const path of [this.keyToPath(key), ...this.sourcePaths(key)]) {
      if (!existsSync(path)) continue;
      const s = await stat(path);
      sizeBytes += s.size;
      const date = s.mtime.toISOString();
      if (mtime === undefined || date > mtime) mtime = date;
    }
    return mtime === undefined ? null : { sizeBytes, mtime };
  }

  async saveAll(entries: ReadonlyArray<[string, unknown]>): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    for (const [key, data] of entries) {
      await writeFile(this.keyToPath(key), JSON.stringify(data, null, 2));
    }
  }
}
