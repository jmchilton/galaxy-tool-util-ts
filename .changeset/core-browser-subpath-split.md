---
"@galaxy-tool-util/core": minor
---

Split into browser-safe universal entry and Node-only `/node` subpath.

**Breaking (pre-1.0):** `FilesystemCacheStorage`, `getCacheDir`, `DEFAULT_CACHE_DIR`, `CACHE_DIR_ENV_VAR`, and `loadWorkflowToolConfig` moved from the root export to `@galaxy-tool-util/core/node`. `ToolCache`'s constructor now requires `storage` — the implicit filesystem fallback is gone. Node callers should use `makeNodeToolCache` / `makeNodeToolInfoService` from `/node` for the default filesystem-backed setup.

The universal entry (`@galaxy-tool-util/core`) is now free of `node:*` imports and top-level Node side effects, so browser bundlers (esbuild `platform:"browser"`, Vite) no longer need shim plugins to consume it. Enforced by `publint`, `@arethetypeswrong/cli`, an esbuild metafile smoke test, and an ESLint `no-restricted-imports` guard.

Adds `"sideEffects": false` and a `"browser"` condition on the root export.
