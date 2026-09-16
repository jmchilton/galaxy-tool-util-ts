/**
 * Typed cache client. Sources its compile-time types from
 * `@galaxy-tool-util/tool-cache-proxy`'s OpenAPI spec — both `tool-cache-proxy`
 * and `gxwf-web` implement the cache surface identically, so any server that
 * speaks it will satisfy these types at runtime.
 */

import createClient from "openapi-fetch";
import type { Client, ClientOptions } from "openapi-fetch";
import type { paths, components } from "@galaxy-tool-util/tool-cache-proxy";

export type { paths, components };
export type CachedToolEntry = components["schemas"]["CachedToolEntry"];
export type CacheStats = components["schemas"]["CacheStats"];
export type CacheClient = Client<paths>;

/**
 * Create an HTTP client pointed at a server that exposes the shared cache
 * surface (gxwf-web or tool-cache-proxy).
 *
 * @param baseUrl - Base URL of the server. Pass "" to use the current origin.
 */
export function createCacheClient(
  baseUrl: string,
  options?: Omit<ClientOptions, "baseUrl">,
): CacheClient {
  return createClient<paths>({ baseUrl, ...options });
}
