/**
 * @module @galaxy-tool-util/tool-cache-proxy
 *
 * HTTP proxy server mirroring a subset of the ToolShed API.
 * Caches and serves tool schemas with CORS support.
 */

/** Load a YAML config file and validate it against the ServerConfig schema. */
export { loadConfig, defaultConfig, ServerConfig } from "./config.js";
export type { ToolSourceConfig, ToolCacheConfig } from "./config.js";
/** Create a proxy context (ToolInfoService + config) and HTTP server. */
export { createProxyContext, createProxyServer, createRequestHandler } from "./router.js";
export type { ProxyContext } from "./router.js";
