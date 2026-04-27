import type { CacheStorage } from "./interface.js";

/** Stable database name — increment version suffix on schema changes. */
const DEFAULT_DB_NAME = "galaxy-tool-cache-v1";
const STORE_NAME = "data";
/** Reserved key used by CacheIndex to store the index metadata object. */
const INDEX_KEY = "__index__";

/**
 * IndexedDB-backed CacheStorage for browser and Web Worker contexts.
 * Suitable for VS Code web extension language servers running as Web Workers.
 *
 * Storage quota: ~80% of free disk space per origin via the Storage Quota API.
 * A large cache (10,000 tools × 50 KB avg) ≈ 500 MB — well within typical limits.
 */
export class IndexedDBCacheStorage implements CacheStorage {
  private db: IDBDatabase | null = null;

  constructor(private readonly dbName: string = DEFAULT_DB_NAME) {}

  private getDb(): Promise<IDBDatabase> {
    if (this.db !== null) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async load(key: string): Promise<unknown | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as unknown) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(key: string, data: unknown): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async list(): Promise<string[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = () =>
        resolve((req.result as IDBValidKey[]).filter((k) => k !== INDEX_KEY) as string[]);
      req.onerror = () => reject(req.error);
    });
  }

  async stat(key: string): Promise<{ sizeBytes: number; mtime?: string } | null> {
    const value = await this.load(key);
    if (value === null) return null;
    let sizeBytes: number;
    if (value instanceof Blob) {
      sizeBytes = value.size;
    } else {
      sizeBytes = JSON.stringify(value).length;
    }
    return { sizeBytes };
  }

  /** Bulk insert using a single transaction — efficient for pre-populating from a bundled dataset. */
  async saveAll(entries: ReadonlyArray<[string, unknown]>): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const [key, data] of entries) {
        store.put(data, key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
