# @galaxy-tool-util/gxwf-ui

Vue 3 + PrimeVue frontend for the `gxwf-web` Galaxy workflow development
server. Embeds a Monaco editor backed by the
[galaxy-workflows-vscode](https://github.com/davelopez/galaxy-workflows-vscode)
LSP servers via `@codingame/monaco-vscode-api`.

## Extension source

The Monaco tab loads the galaxy-workflows-vscode extension at startup. The
source is selected by `VITE_GXWF_EXT_SOURCE`:

| Spec | Use | Example |
|---|---|---|
| `folder:<abs-path>` | dev — Vite `/@fs` route against a live checkout | `folder:/Users/me/repos/galaxy-workflows-vscode` |
| `vsix:<url-prefix>` | everywhere else — unpacked `.vsix` served over HTTP | `vsix:/ext/galaxy-workflows` |

Default when unset: `vsix:/ext/galaxy-workflows`.

Both modes point the loader at a **directory of files reachable over HTTP**.
For `folder:` the directory is a live extension checkout exposed via Vite's
`/@fs` dev route; for `vsix:` it is an unpacked `.vsix` staged into
`public/ext/galaxy-workflows/` by `scripts/stage-extension.mjs`. No in-browser
unzip, no blob URLs.

Production deployments are expected to download the extension (e.g. from Open
VSX) at server startup, unpack it to the same `/ext/galaxy-workflows/`
layout, and point `VITE_GXWF_EXT_SOURCE` at it. That server-side wiring is
out of scope for this package.

See `EXT_COMMIT.md` for the pinned upstream revision.

### Pinning and bumps

`EXT_COMMIT.md` is the single source of truth. Bump it in the same commit
that bumps any derived artifact (`.vsix` fixture, CI checkout). See the file
for the full bump procedure.

## Developer workflow

Typical loop: edit gxwf-ui and the extension together.

```sh
# 1. clone galaxy-workflows-vscode beside this repo
git clone https://github.com/davelopez/galaxy-workflows-vscode ~/projects/repositories/galaxy-workflows-vscode
cd ~/projects/repositories/galaxy-workflows-vscode
git checkout <EXTENSION_COMMIT from EXT_COMMIT.md>
npm install
npm run compile  # one-shot; watch is started for you in step 3

# 2. export the checkout path
export GXWF_EXT_PATH=~/projects/repositories/galaxy-workflows-vscode

# 3. run both processes together from gxwf-ui
pnpm -F @galaxy-tool-util/gxwf-ui dev:with-ext
```

`dev:with-ext` spawns the extension's `build:watch` in one pane and
`vite dev` (with `VITE_GXWF_EXT_SOURCE=folder:$GXWF_EXT_PATH`) in the other.
Vite HMR does not reload the extension-host worker; after the extension
rebuilds, **refresh the browser tab** to pick up the new code. (Watch-mode
reload is tracked in `VS_CODE_MONACO_FIRST_PLAN_V2.md` Phase 3.3 and
deferred until the manual refresh becomes painful.)

The driver fails loudly if `GXWF_EXT_PATH` is unset, points at a
non-extension directory, or the checkout lacks `build:watch`.

## Running against a `.vsix`

When you want to exercise the production-shaped load path (no Vite `/@fs`
route), package the extension, drop it in `fixtures/`, and let the prebuild
hook unpack it:

```sh
cd $GXWF_EXT_PATH
npx vsce package --out /tmp/galaxy-workflows.vsix
cp /tmp/galaxy-workflows.vsix packages/gxwf-ui/fixtures/galaxy-workflows.vsix
VITE_GXWF_EXT_SOURCE=vsix:/ext/galaxy-workflows pnpm -F @galaxy-tool-util/gxwf-ui dev
```

`scripts/stage-extension.mjs` runs on `predev` / `prebuild`, unzipping the
fixture into `public/ext/galaxy-workflows/`. Vite serves `public/ext/` at
`/ext/`; the loader registers each file by URL. Remove the fixture to
revert to a default (Monaco-free) build.

## Runtime settings

Monaco user config is assembled from env vars at init:

| Variable | Maps to |
|---|---|
| `VITE_GXWF_TOOLSHED_URL` | `galaxyWorkflows.toolShed.url` |
| `VITE_GXWF_TOOL_CACHE_PROXY_URL` | `galaxyWorkflows.toolCacheProxy.url` |
| `VITE_GXWF_CACHE_DB_NAME` | `galaxyWorkflows.cacheDbName` |
| `VITE_GXWF_VALIDATION_PROFILE` | `galaxyWorkflows.validation.profile` |

See `src/editor/services.ts` for defaults.

## Tool cache (browser mode)

The embedded extension binds `TYPES.CacheStorageFactory` to an
`IndexedDBCacheStorage` (DB name `galaxy-tool-cache-v1` by default; override
with `VITE_GXWF_CACHE_DB_NAME` if per-deployment isolation is needed). On
first LSP hover against a tool parameter the cache populates; confirm in
DevTools > Application > IndexedDB.

Fetches hit `https://toolshed.g2.bx.psu.edu` directly from the browser. If
CORS on the target ToolShed blocks browser-origin GETs, run a
`@galaxy-tool-util/tool-cache-proxy` instance and set
`VITE_GXWF_TOOL_CACHE_PROXY_URL` at build time — the extension prefers the
proxy URL when configured. Remember to add the proxy origin to gxwf-web's
CSP `connect-src` (see the gxwf-web `--csp-connect-src` flag).
