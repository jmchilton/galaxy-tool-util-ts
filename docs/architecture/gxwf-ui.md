# gxwf-ui Frontend

`@galaxy-tool-util/gxwf-ui` is the Vue 3 + PrimeVue single-page app served by `gxwf-web`. It surfaces the workflow-operations API (validate, lint, clean, roundtrip, export, convert) and the Jupyter-compatible contents API as a browser UI, and optionally embeds a Monaco editor with the same LSP servers that power the [galaxy-workflows-vscode](https://github.com/davelopez/galaxy-workflows-vscode) extension.

This page is the architectural map: routes, state layout, how the UI talks to the backend, how it integrates with the sibling `gxwf-report-shell` package, and why the Monaco embedding looks the way it does.

Related docs with no intentional overlap:

- [gxwf-web Server](guide/gxwf-web.md) — HTTP API reference (contents, workflow operations, schema export).
- [Workflow Operations](guide/workflow-operations.md) — what each operation means semantically.
- [End-to-End Tests](development/e2e-testing.md) — Playwright harness and Monaco-gated specs.
- `packages/gxwf-ui/README.md` — dev loop with a live `galaxy-workflows-vscode` checkout, env-var reference, `.vsix` packaging.
- `packages/gxwf-ui/EXT_COMMIT.md` — pinned upstream revision of the LSP extension.

## Application shape

Three routes, three views:

```
/                       → DashboardView   → WorkflowList
/workflow/:path         → WorkflowView    → OperationPanel
/files/:path?           → FileView        → FileBrowser + MonacoEditor | EditorShell
```

- **Dashboard** — a PrimeVue `DataTable` listing discovered workflows with format tag and a "Last Run" status badge. The badge is driven entirely from the in-memory operation cache (see [State layer](#state-layer)); no background polling.
- **Workflow** — an `OperationPanel` with one tab per operation. Each tab has a run button, operation-specific option checkboxes (`strict_structure`, `strict_encoding`, `strict_state`, `clean_first`, `dry_run`, validate `mode`), a Raw JSON / Formatted toggle, and renders the report via a component from `@galaxy-tool-util/gxwf-report-shell`.
- **Files** — a tree browser over the Jupyter contents API alongside an editor. The editor is Monaco when `VITE_GXWF_MONACO=1` *and* the extension loads successfully, otherwise the `EditorShell` textarea fallback. Save/undo are handled here (see [File editing flow](#file-editing-flow)).

Top-level chrome is fixed: `App.vue` renders a header with Dashboard/Files nav and a dark-mode toggle (persisted in `localStorage` under `gxwf-dark`), with the router view below.

## Two backends, one SPA

`gxwf-ui` is deliberately backend-agnostic. The same built `dist/` is served by two different servers that speak the same OpenAPI contract:

- **TypeScript** — `@galaxy-tool-util/gxwf-web` (this monorepo) bundles the UI as a devDependency and serves it from `dist/` alongside the API.
- **Python** — a standalone FastAPI `gxwf-web` consumes the same built artifact from `packages/gxwf-ui/dist/`.

The contract is `packages/gxwf-web/openapi.json`. `@galaxy-tool-util/gxwf-client` is generated from that file and consumed by the UI — so any endpoint shape change is a type error in the UI until the spec and the generated client are regenerated. Both backends must keep `openapi.json` in sync; the TS side has a `make sync-openapi` / `pnpm codegen` path to pull updated specs from the Python source of truth.

One consequence: nothing in the UI should assume TypeScript-server-specific behavior. If the Python backend returns a narrower response, the UI should handle the shared shape. Report-rendering components are factored into `gxwf-report-shell` precisely so the Python side can reuse them verbatim without depending on `gxwf-ui`'s routing or layout.

## Typed API client

`src/composables/useApi.ts` returns a singleton [openapi-fetch](https://openapi-ts.pages.dev/openapi-fetch/) client built from the generated `gxwf-client` types:

```
createGxwfClient(BASE_URL)  ──▶  typed GET/POST/PUT over openapi.json paths
```

`BASE_URL` is empty by default — the UI is served from the same origin as the API. `VITE_API_BASE_URL` overrides this for split-origin deployments. In dev, the Vite config proxies `/workflows`, `/api`, and the operation endpoints to a separately-run backend on `localhost:8000`.

All request/response shapes flow from the generated types, so adding an operation or parameter on the server triggers a typecheck failure on the UI side until the handler is updated.

## State layer

State lives in composables under `src/composables/`. Each composable hangs its state off **module-level `ref`s or `reactive`s**, not `provide/inject` or a store library — the module itself is the singleton. Calling the composable from any component yields live access to the same state.

| Composable | State shape | Role |
|---|---|---|
| `useApi` | cached client instance | one typed HTTP client for the whole app |
| `useWorkflows` | `{ workflows, directory, loading, error, selected }` | workflow index; `fetchWorkflows` / `refreshWorkflows` |
| `useContents` | `{ root, loading, error }` + per-path helpers | Jupyter contents state; read / write / checkpoint |
| `useOperation` | `opCache: Record<path, OperationState>` | per-workflow operation results, loading flags, errors |

### Operation cache (`opCache`)

`opCache` is the most load-bearing piece of UI state. It keys operation results by workflow path so that:

- Navigating Dashboard → Workflow → Dashboard doesn't discard results a user just ran.
- The Dashboard's "Last Run" badge is a reactive `computed` over `opCache[path]` for every listed workflow — no extra fetches, and status updates appear the moment an operation finishes on the Workflow view.

Three exported helpers encode the caching rules:

- `getLastRunStatus(path)` — returns `"ok" | "fail" | null`. Considers only operations that have a pass/fail notion (validate, lint, roundtrip). Clean / export / convert don't contribute a status — running them alone leaves the badge empty.
- `clearOpCache(path)` — wipes all cached results for a path. Called after a successful file save, since every cached result is now potentially stale.
- `invalidateStaleOps(path, keep)` — drops every cached result *except* the one that just produced a mutation. Used after `clean` / `convert`: the user should still see the mutation's report, but the validate / lint results from before the mutation should not stay visible as if they were still current.

### Mutation-aware navigation

`OperationPanel` couples operation results to file-system side effects:

- `clean` (non-dry-run): `invalidateStaleOps(path, "clean")` + `refreshWorkflows()` — the file changed but its path is unchanged; other cached reports are now stale.
- `export` (non-dry-run): `refreshWorkflows()` only — the source file is unchanged, a new file appeared alongside.
- `convert` (non-dry-run): `window.confirm` first (convert writes a new file *and deletes the original*), then `refreshWorkflows()` and `router.push("/")` — the route path no longer exists.

## File editing flow

The save path in `FileView.vue` is deliberately more than a PUT:

```
User clicks Save
   │
   ├─▶ POST /api/contents/{path}/checkpoints     (snapshot for undo)
   │
   ├─▶ PUT  /api/contents/{path}                  (If-Unmodified-Since: last_modified)
   │     └ 409 ⇒ "file modified externally, re-open"
   │
   ├─▶ clearOpCache(path)                         (results are stale)
   │
   └─▶ fetchWorkflows()                           (index may reflect new metadata)

User clicks Undo
   │
   ├─▶ POST /api/contents/{path}/checkpoints/{id} (restore)
   ├─▶ GET  /api/contents/{path}                  (reload into editor)
   ├─▶ clearOpCache(path)
   └─▶ fetchWorkflows()
```

Two behaviors worth calling out:

- **Single-level undo.** Each save creates a new checkpoint; the in-memory `checkpoint` ref is overwritten on each save, so Undo always targets the most recent save. This is a UI choice — the contents API supports listing and restoring any checkpoint.
- **Optimistic concurrency.** `If-Unmodified-Since` is sourced from the `ContentsModel` fetched when the file was opened. If someone else wrote to the file in the interim, the server returns 409 and the UI surfaces a "re-open to get the latest version" message rather than silently clobbering.

## Reports via `gxwf-report-shell`

The formatted report bodies (`ValidationReport`, `LintReport`, `CleanReport`, `RoundtripReport`, `ExportReport`, plus their tree-variant counterparts and a shared `ToolId` link component) live in `@galaxy-tool-util/gxwf-report-shell`, a sibling package. `gxwf-ui` only wires them into tabs: toolbar + options on top, `<RawJsonView>` vs the formatted component underneath, all driven by `opCache`.

This boundary exists so the Python `gxwf-web` can serve the same UI artifact and the CLI can eventually render reports to HTML via templates that consume the same report JSON shapes. The division is the one mentioned in the project context: `gxwf-report-shell` is pure report display; `gxwf-ui` is the app that hosts them.

## Editor: Monaco (opt-in) with textarea fallback

`FileView.vue` instantiates one of two editors:

- **`EditorShell`** (default, always bundled) — a plain `<textarea>` with a language label derived from the file extension. This is what ships when `VITE_GXWF_MONACO` is unset. Zero extra bundle cost.
- **`MonacoEditor`** (build-time opt-in via `VITE_GXWF_MONACO=1`) — the Monaco editor loaded through `@codingame/monaco-vscode-api`, with the `galaxy-workflows-vscode` extension running in an extension-host worker. Dynamically imported via `defineAsyncComponent` so Vite dead-code-eliminates the twelve `@codingame/monaco-vscode-*` packages and the extension loader when the flag is off.

If `MonacoEditor` emits an `error` event (extension 404, init failure, missing fixture), `FileView` sets `monacoFailed` and swaps in `EditorShell` with a warning banner. The user can keep editing and saving; only the editor experience degrades.

The two editors intentionally use **different language maps**. `EditorShell` maps file extensions to plain Monaco-less language hints (`yaml`, `json`, `python`, …). `MonacoEditor` resolves languages through `src/editor/languageId.ts` against IDs contributed by the loaded extension (`galaxyworkflow`, `gxformat2`, `gxwftests`), which don't exist outside Monaco.

The rest of this page covers the Monaco half in detail.

## Monaco architecture

```
┌────────────── gxwf-ui (Vue 3 SPA) ─────────────────────────┐
│  /files/:path                                              │
│    └─ FileView.vue                                         │
│         ├─ MonacoEditor.vue (when VITE_GXWF_MONACO=1)      │
│         │      ▲ side-effect import: monacoEnvironment     │
│         │      │                                           │
│         │      ├─ initMonacoServices()   (services.ts)     │
│         │      ├─ loadGalaxyWorkflowsExtension()           │
│         │      │     └─ parseExtensionSource(env)          │
│         │      │          ├─ folder: ... Vite /@fs         │
│         │      │          └─ vsix:   ... /ext/...          │
│         │      ├─ upsertMemoryFile()     (fileSystem.ts)   │
│         │      └─ resolveLanguageId()    (languageId.ts)   │
│         │                                                  │
│         └─ EditorShell.vue (textarea fallback)             │
│                                                            │
│  Extension-host worker ──────────────────────────────────┐ │
│    extensionHostWorker.ts                                │ │
│      └ loads galaxy-workflows-vscode browser entry       │ │
│         ├ ls-native   (galaxyworkflow language)          │ │
│         └ ls-format2  (gxformat2 + gxwftests)            │ │
│                                                          │ │
│    Iframe: webWorkerExtensionHostIframe.html (staged     │ │
│    into public/monaco/ by postinstall hook)              │ │
│                                                          │ │
│    Tool-info fetches → IndexedDBCacheStorage             │ │
│      └ ToolShed direct, or configured tool-cache-proxy   │ │
│  ──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘

         │    static assets served by gxwf-web
         │    (bundle + /ext/ + /monaco/) with CSP header
         ▼
┌────────────── gxwf-web (Node HTTP server) ─────────────────┐
│  /api/contents/* — file CRUD (powers MonacoEditor content) │
│  /ext/*          — unpacked extension assets (vsix: mode)  │
│  /monaco/*       — iframe HTML + any other staged monaco   │
│  Content-Security-Policy header on every static response   │
└────────────────────────────────────────────────────────────┘
```

The editor DOM, the extension-host worker, and the LSP servers all run in the user's browser tab. `gxwf-web` only serves the bundle and the extension files; it does not proxy LSP traffic.

## Extension source modes

`VITE_GXWF_EXT_SOURCE` selects how the extension is delivered to the browser:

| Spec | Resolves to | Used when |
|---|---|---|
| `folder:/abs/path` | `${origin}/@fs/abs/path` via Vite's dev server | local dev against a live checkout |
| `vsix:/ext/galaxy-workflows` | `${origin}/ext/galaxy-workflows` (static assets) | e2e tests, previews, production |
| `vsix:https://host/path` | the absolute URL as-is | production deployments with a dedicated CDN |

Both modes converge on a single `loadFromBase(baseUrl)` function that fetches `package.json`, walks the manifest's `contributes` + `browser` fields, and registers each discovered file with monaco-vscode-api by absolute URL. There is no in-browser unzip — unzipping happens once on the Node side.

For `vsix:` the extension directory is populated by `scripts/stage-extension.mjs`, which runs on `predev` / `prebuild`:

```
packages/gxwf-ui/fixtures/galaxy-workflows.vsix   (local, gitignored)
   ↓ stage-extension.mjs
packages/gxwf-ui/public/ext/galaxy-workflows/    (gitignored)
   ↓ Vite copies public/ into dist/ on build
packages/gxwf-ui/dist/ext/galaxy-workflows/      (served by gxwf-web as /ext/...)
```

Production servers are expected to perform the same unpack at startup (e.g. from Open VSX into the same `/ext/galaxy-workflows/` layout) so the browser never fetches `.vsix` or `blob:` URLs.

## Pinning the extension

`packages/gxwf-ui/EXT_COMMIT.md` is the single source of truth for which `galaxy-workflows-vscode` revision gxwf-ui is built against. Any bump of the `.vsix` fixture, a CI checkout of the extension repo, or a production server's Open VSX pin should ship in the same commit as an update to this file.

## Critical pitfalls

Most of these are artifacts of how `@codingame/monaco-vscode-api` works under the hood. They are load-bearing; regressing any one of them tends to surface as a blank editor, a "Failed to fetch" error with no URL, or an opaque `Missing method $init on worker thread channel default`.

1. **Pin every `@codingame/monaco-vscode-*` package to the same exact version.** No carets. A version skew between the API package and any service override breaks silently.
2. **`monaco-editor` and `vscode` are aliases, not real dependencies.** They resolve to `@codingame/monaco-vscode-editor-api` and `@codingame/monaco-vscode-extension-api`. Installing the real `monaco-editor` pulls a second Monaco runtime into the bundle.
3. **`MonacoEnvironment` must implement `getWorker`, `getWorkerUrl`, and `getWorkerOptions`.** The TextMate override ships its own worker (`@codingame/monaco-vscode-textmate-service-override/worker`); using the editor worker for the `TextMateWorker` label fails.
4. **`getWorkerOptions` must return `{ type: "module" }` for `extensionHost*` labels** so the iframe HTML takes the `await import(url)` branch — necessary for Vite's ESM `?worker&url` output.
5. **`registerFileUrl(path, url)` requires `url` be absolute with an origin** (e.g. `${self.location.origin}/@fs/...`). Scheme-less paths default to `file:` and the worker can't fetch them from an `http:` origin. The surface error is a bare "Failed to fetch" with no URL — a `self.fetch` wrapper in `extensionHostWorker.ts` logs the failing URL as a standing diagnostic.
6. **The iframe HTML (`webWorkerExtensionHostIframe.html`) can't be deep-imported.** The override package's `exports` map only matches `.js`/`.css`/`.d.ts`. A postinstall script copies it into `public/monaco/`.
7. **Extension-host worker entry uses a static import** of the monaco-vscode-api worker main. Vite's worker bundling can't follow a dynamic `import()` to that path.
8. **Vite config:** `optimizeDeps.exclude` every `@codingame/monaco-vscode-*` package (the optimizer strands sibling assets), `worker.format: "es"`, `build.target: "esnext"`, and add the extension worktree root to `server.fs.allow` for `folder:` delivery.

Service override naming at v30 has its own quirks (`quickaccess-service-override`, not `quickinput-*`; no `language-detection-worker-service-override`; `shouldUseGlobalKeybindings`, not `…GlobalStorage`; `initUserConfiguration(jsonString)` must be called *before* `initialize(...)`). Check the comments in `packages/gxwf-ui/src/editor/services.ts` when adding an override.

## CSP

`gxwf-web` emits a `Content-Security-Policy` header on every static response (see `packages/gxwf-web/src/router.ts`). The baseline allows `'self'` for scripts, workers, frames, styles, and connects; `connect-src` also lists the public ToolShed by default. Per-deployment origins (a tool-cache-proxy, a private ToolShed mirror) thread in via `--csp-connect-src <origin>` or the `extraConnectSrc` option on `createApp()`.

`style-src 'unsafe-inline'` is required — monaco-vscode-api injects stylesheets directly into `document.head` at runtime — and `wasm-unsafe-eval` is required by some TextMate engines. `frame-src 'self' blob:` covers the extension-host iframe. The header is sent unconditionally rather than being gated to `text/html`; subresource loads already inherit the document's CSP, so restricting the header adds no security and complicates the middleware.

## Monaco user settings

Build-time env vars are assembled into a `configurationService` JSON blob and handed to `initUserConfiguration(...)` before `initialize(...)`:

| Variable | Configuration key |
|---|---|
| `VITE_GXWF_TOOLSHED_URL` | `galaxyWorkflows.toolShed.url` |
| `VITE_GXWF_TOOL_CACHE_PROXY_URL` | `galaxyWorkflows.toolCacheProxy.url` |
| `VITE_GXWF_CACHE_DB_NAME` | `galaxyWorkflows.cacheDbName` |
| `VITE_GXWF_VALIDATION_PROFILE` | `galaxyWorkflows.validation.profile` |

These map to `workspace.getConfiguration("galaxyWorkflows")` inside the loaded extension. The cache-DB name is worth overriding per-deployment if multiple gxwf-web instances share an origin and should not cross-contaminate IndexedDB.

## CSS scoping

Mounting Monaco inside an existing PrimeVue-themed Vue app raises the obvious concern: will Monaco's stylesheets clobber app chrome, or will PrimeVue's preflight break editor internals? Today the answer is "neither" — Monaco's contributed selectors stay inside `.monaco-*` / `.codicon-*` and PrimeVue's preflight doesn't reach into the editor's shadow-like internals.

That property is fragile — a single service override bumped to a new major, or a Monaco release that starts leaking global selectors, would regress it silently. Two Playwright specs defend it: a regression guard that runs in the normal e2e suite, and an opt-in inventory audit. Both are documented under [End-to-End Tests › CSS scoping guards](development/e2e-testing.md#css-scoping-guards), along with the upgrade procedure that runs them on `@codingame/monaco-vscode-*` and extension bumps.
