/**
 * @module @galaxy-tool-util/gxwf-client
 *
 * Typed HTTP client for the gxwf-web Galaxy workflow server.
 *
 * @example
 * ```ts
 * import { createGxwfClient } from "@galaxy-tool-util/gxwf-client";
 *
 * const client = createGxwfClient("http://localhost:8000");
 *
 * const { data, error } = await client.GET("/workflows", {});
 * const { data: report } = await client.GET("/workflows/{workflow_path}/validate", {
 *   params: { path: { workflow_path: "my_workflow.ga" } },
 * });
 * ```
 */

import createClient from "openapi-fetch";
import type { Client, ClientOptions } from "openapi-fetch";
import type { paths, components, operations } from "@galaxy-tool-util/gxwf-web";

export type { paths, components, operations };
export type { Client, ClientOptions };

/** A fully-typed gxwf-web HTTP client. */
export type GxwfClient = Client<paths>;

/**
 * Create a typed HTTP client pointed at a gxwf-web server.
 *
 * @param baseUrl - Base URL of the gxwf-web server (e.g. "http://localhost:8000")
 * @param options - Additional openapi-fetch ClientOptions (headers, custom fetch, etc.)
 */
export function createGxwfClient(
  baseUrl: string,
  options?: Omit<ClientOptions, "baseUrl">,
): GxwfClient {
  return createClient<paths>({ baseUrl, ...options });
}
