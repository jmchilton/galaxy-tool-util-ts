import { ToolCache } from "@galaxy-tool-util/core";

export interface ListOptions {
  json?: boolean;
  cacheDir?: string;
}

export async function runList(opts: ListOptions): Promise<void> {
  const cache = new ToolCache({ cacheDir: opts.cacheDir });
  await cache.index.load();
  const entries = cache.listCached();

  if (entries.length === 0) {
    console.log("Cache is empty.");
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  const header = ["Tool ID", "Version", "Source", "Cached At"];
  const rows = entries.map((e) => [e.tool_id, e.tool_version, e.source, e.cached_at]);

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const sep = widths.map((w) => "-".repeat(w)).join("  ");

  console.log(header.map((h, i) => h.padEnd(widths[i])).join("  "));
  console.log(sep);
  for (const row of rows) {
    console.log(row.map((c, i) => c.padEnd(widths[i])).join("  "));
  }
}
