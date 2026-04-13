import { makeNodeToolCache } from "@galaxy-tool-util/core/node";

export interface ClearOptions {
  cacheDir?: string;
}

export async function runClear(prefix: string | undefined, opts: ClearOptions): Promise<void> {
  const cache = makeNodeToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();
  const before = (await cache.listCached()).length;
  await cache.clearCache(prefix);
  const after = (await cache.listCached()).length;
  const removed = before - after;
  if (prefix) {
    console.log(`Removed ${removed} entries matching "${prefix}".`);
  } else {
    console.log(`Cleared ${removed} entries from cache.`);
  }
}
