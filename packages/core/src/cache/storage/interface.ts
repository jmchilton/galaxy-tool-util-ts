/**
 * Pluggable storage backend for the tool cache.
 * Implementations: FilesystemCacheStorage (Node.js), IndexedDBCacheStorage (browser/Web Worker).
 */
export interface CacheStorage {
  /** Load a value by key. Returns null if not found. */
  load(key: string): Promise<unknown | null>;
  /** Persist a value under key. Creates storage if needed. */
  save(key: string, data: unknown): Promise<void>;
  /** Remove a key. No-op if not found. */
  delete(key: string): Promise<void>;
  /** List all tool keys (excludes internal metadata keys). */
  list(): Promise<string[]>;
  /** Optional bulk insert — single transaction for efficiency (e.g. pre-populating from bundle). */
  saveAll?(entries: ReadonlyArray<[string, unknown]>): Promise<void>;
}
