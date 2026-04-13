# @galaxy-tool-util/core

Galaxy tool cache, ToolShed client, and ParsedTool models.

## Installation

```bash
npm install @galaxy-tool-util/core
```

## Usage

The package ships two entry points:

- **`@galaxy-tool-util/core`** — universal (browser + Node). Models, schemas,
  `ToolCache` (with injected storage), `IndexedDBCacheStorage`, `ToolInfoService`,
  `cacheKey`, ToolShed/Galaxy clients, YAML config schemas.
- **`@galaxy-tool-util/core/node`** — Node-only helpers that pull in `fs`, `path`,
  `os`: `FilesystemCacheStorage`, `getCacheDir`, `DEFAULT_CACHE_DIR`,
  `CACHE_DIR_ENV_VAR`, `loadWorkflowToolConfig`, plus convenience factories
  `makeNodeToolCache` and `makeNodeToolInfoService`.

### Browser / Web Worker

```ts
import { ToolCache, IndexedDBCacheStorage } from "@galaxy-tool-util/core";

const cache = new ToolCache({
  storage: new IndexedDBCacheStorage("gxwf-tool-cache"),
});
```

### Node

```ts
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";

const cache = makeNodeToolCache(); // defaults to ~/.galaxy/tool_info_cache
```

Bundlers targeting the browser will fail fast if `/node` is imported — by
design. Keep Node-only imports on the server side of your application.

## License

MIT
