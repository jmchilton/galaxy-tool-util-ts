/** Default Galaxy ToolShed URL. */
export const DEFAULT_TOOLSHED_URL = "https://toolshed.g2.bx.psu.edu";
/** Environment variable to override the default ToolShed URL. */
export const TOOLSHED_URL_ENV_VAR = "GALAXY_TOOLSHED_URL";
/** Environment variable to override the cache directory. */
export const CACHE_DIR_ENV_VAR = "GALAXY_TOOL_CACHE_DIR";
/**
 * Sentinel version for stock/built-in Galaxy tools (`cat1`, `__APPLY_RULES__`, …)
 * that carry no explicit version. Mirrors the Python `_default_` convention so a
 * cache key / schema-cache entry can still be formed instead of skipping the tool.
 */
export const DEFAULT_TOOL_VERSION = "_default_";
