/**
 * Default URL resolver for subworkflow expansion.
 *
 * Handles:
 * - base64:// URLs: base64-decode inline content, parse as YAML/JSON
 * - TRS URLs (GA4GH pattern): fetch descriptor endpoint, extract `content`
 * - Plain HTTP/HTTPS URLs: fetch and parse based on content-type
 * - File paths (no ://): read from workflowDirectory
 *
 * Port of gxformat2/options.py default_url_resolver + resolve_import.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as yaml from "yaml";
import { isTrsUrl, type RefResolver } from "@galaxy-tool-util/schema";

export interface DefaultResolverOptions {
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetcher?: typeof fetch;
  /** Directory for resolving relative file path references. */
  workflowDirectory?: string;
}

/**
 * Create a default RefResolver that handles base64, TRS, HTTP, and file paths.
 */
export function createDefaultResolver(opts: DefaultResolverOptions = {}): RefResolver {
  const fetcher = opts.fetcher ?? globalThis.fetch;
  const workflowDirectory = opts.workflowDirectory;

  return async (ref: string): Promise<Record<string, unknown>> => {
    // base64:// — inline encoded workflow
    if (ref.startsWith("base64://")) {
      const encoded = ref.slice("base64://".length);
      const content = Buffer.from(encoded, "base64").toString("utf-8");
      return yaml.parse(content) as Record<string, unknown>;
    }

    // URL — fetch via HTTP
    if (ref.includes("://")) {
      const response = await fetcher(ref, {
        headers: { Accept: "application/json, application/x-yaml, text/yaml, */*" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${ref}: ${response.status}`);
      }

      if (isTrsUrl(ref)) {
        const descriptor = (await response.json()) as Record<string, unknown>;
        return yaml.parse(descriptor.content as string) as Record<string, unknown>;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("json")) {
        return (await response.json()) as Record<string, unknown>;
      }
      const text = await response.text();
      return yaml.parse(text) as Record<string, unknown>;
    }

    // File path — read from workflowDirectory
    if (!workflowDirectory) {
      throw new Error(`Cannot resolve file path '${ref}' without workflowDirectory`);
    }
    const fullPath = join(workflowDirectory, ref);
    const content = await readFile(fullPath, "utf-8");
    return yaml.parse(content) as Record<string, unknown>;
  };
}
