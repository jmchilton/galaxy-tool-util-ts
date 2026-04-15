# End-to-End Tests

End-to-end coverage for `gxwf-web` + `gxwf-ui` lives in `packages/gxwf-e2e/`. The runner is [Playwright](https://playwright.dev/); the harness reuses `gxwf-web`'s `createApp()` in-process and serves `gxwf-ui`'s production bundle against a per-suite temp workspace.

The architectural backdrop for the Monaco-specific specs — why CSP looks the way it does, why CSS scoping matters, what monaco-vscode-api is doing under the hood — lives in [gxwf-ui Frontend](architecture/gxwf-ui.md).

## Running the suite

```bash
# Full e2e suite (Monaco specs self-skip without a fixture — see below)
pnpm --filter @galaxy-tool-util/gxwf-e2e test

# Skip the implicit gxwf-ui rebuild when iterating locally
GXWF_E2E_SKIP_UI_BUILD=1 pnpm --filter @galaxy-tool-util/gxwf-e2e test

# Single spec
pnpm --filter @galaxy-tool-util/gxwf-e2e exec playwright test tests/monaco-boot.spec.ts
```

Fresh clones and default CI runs stay Monaco-free: the Monaco specs require a local fixture that is gitignored by design (see [Opt-in Monaco specs](#opt-in-monaco-specs)).

## Harness shape

`src/harness.ts` exports `startHarness({ seed, uiDir })`:

1. Clones the fixture workspace (`fixtures/workspace-seed/`) to a tmp dir per suite.
2. Calls `createApp(workspaceDir, { uiDir })` and listens on an ephemeral localhost port.
3. Returns `{ baseUrl, workspaceDir, stop() }`.

`src/global-setup.ts` runs `pnpm --filter gxwf-ui build` once per test run (unless `GXWF_E2E_SKIP_UI_BUILD=1` is set and the dist already exists). If a Monaco fixture is present, the build runs with `VITE_GXWF_MONACO=1`, `VITE_GXWF_EXPOSE_MONACO=1`, and the default `VITE_GXWF_EXT_SOURCE`.

## Opt-in Monaco specs

The `tests/monaco-*.spec.ts` suites self-skip unless `packages/gxwf-ui/fixtures/galaxy-workflows.vsix` is present. That file is gitignored and must be produced locally (or by a dedicated upgrade-audit workflow).

Producing the fixture once per box:

```bash
# Clone the extension at the pinned commit
git clone https://github.com/davelopez/galaxy-workflows-vscode ~/repos/galaxy-workflows-vscode
cd ~/repos/galaxy-workflows-vscode
git checkout <EXTENSION_COMMIT from packages/gxwf-ui/EXT_COMMIT.md>
pnpm install && pnpm build

# Package and drop into gxwf-ui fixtures
npx @vscode/vsce package --no-dependencies
cp galaxy-workflows-*.vsix <monorepo>/packages/gxwf-ui/fixtures/galaxy-workflows.vsix
```

`global-setup.ts` sets `process.env.GXWF_E2E_MONACO=1` when the fixture is present; specs read it at import time and gate a `test.skip(!MONACO_ENABLED, ...)` at the suite level via the `monacoHarnessSuite(...)` helper in `src/monaco.ts`.

## Test-only Monaco handle

When a Monaco build is produced with `VITE_GXWF_EXPOSE_MONACO=1` (or in dev), `MonacoEditor.vue` publishes a `window.__gxwfMonaco = { monaco, editor, model }` global and sets `data-monaco-ready="true"` on the host element. Specs drive the live editor through that handle — setting the cursor, triggering hover, reading model markers, inspecting token language IDs. The handle is declared in `packages/gxwf-e2e/src/monaco.ts` so its type surface doesn't leak into the shipped `gxwf-ui` types.

## What each Monaco spec covers

| Spec | What it guards |
|---|---|
| `monaco-boot.spec.ts` | Editor mounts, resolves language by extension, exposes exactly one editor; navigating away disposes cleanly; no CSP violations on boot |
| `monaco-language-detection.spec.ts` | `.ga` / `.gxwf.yml` / `-tests.yml` / `-tests.gxwf.yml` each resolve to the expected language id |
| `monaco-hover.spec.ts` | LSP hover returns non-empty content on `class:` in a format2 file (proves the extension-host → LSP worker path is live) |
| `monaco-diagnostics.spec.ts` | A deliberately broken format2 fixture produces at least one error marker |
| `monaco-fallback.spec.ts` | A 404 on the extension's `package.json` triggers the `EditorShell` textarea fallback and the "Monaco editor failed to load" banner; edits still propagate and save |
| `monaco-css-scoping.spec.ts` | **Regression guard** — fails if Monaco starts injecting globally-scoped selectors. See [CSS scoping guards](#css-scoping-guards). |
| `_inventory-monaco-css.spec.ts` | Opt-in audit spec; see [CSS scoping guards](#css-scoping-guards) |

## Shared helpers (`src/monaco.ts`)

- `monacoHarnessSuite(name, body)` — wraps `test.describe.serial` with `beforeAll`/`afterAll` harness lifecycle and the `GXWF_E2E_MONACO` skip. Most Monaco specs are one-liners built on top.
- `openFileViaUrl(page, baseUrl, relPath)` — URL-encodes and navigates to `/files/<path>`.
- `waitForMonaco(page)` — waits for `data-monaco-ready='true'` and the global handle.
- `waitForLspReady(page)` — matches the extension's "server is ready" console log; arm it *before* navigation so the log isn't missed.
- `triggerHoverAt(page, line, column)` — positions the cursor and invokes `editor.action.showHover`.
- `waitForMarkers(page, { severity, minCount })` — polls `monaco.editor.getModelMarkers(...)` until satisfied.
- `blockExtensionLoad(page)` — `page.route`-fulfills the extension's first fetch with a 404, driving the fallback path.
- `collectCspViolations(page)` — attaches `pageerror` + `console` listeners that capture anything mentioning "Content Security Policy"; `assertClean()` fails the test if any were seen.

## CSS scoping guards

The framing — why we care that Monaco's selectors stay inside `.monaco-*` / `.codicon-*` — is in [gxwf-ui Frontend › CSS scoping](architecture/gxwf-ui.md#css-scoping). This section is the operational half: what the two specs actually do and when to run them.

### Regression guard: `monaco-css-scoping.spec.ts`

Runs in the normal e2e suite. Snapshots `document.styleSheets` on a Monaco-free page, mounts Monaco, diffs, and fails if any newly-added non-PrimeVue stylesheet contains a selector that would reach outside `.monaco-*` / `.codicon-*` scope — universal (`*`), document-root (`html`, `body`, `:root`, `:host`), or bare form/link element names.

If the guard fails, the failure message is self-contained: it lists the offending selectors grouped by stylesheet and walks through the response (check whether a service override can be dropped, pin back to the prior monaco-vscode-api version, or isolate the editor in a shadow DOM / CSS layer). Do *not* respond by adding a selector to the allowlist — that's silencing a smoke detector.

### Opt-in audit: `_inventory-monaco-css.spec.ts`

Gated behind `GXWF_E2E_INVENTORY=1`. Captures before/after screenshots of Dashboard, WorkflowView, and FileView; probes computed styles on a fixed set of app elements; and writes a full stylesheet inventory (with sample selectors and byte counts) to `packages/gxwf-e2e/.inventory/REPORT.md`. Screenshots land beside the report.

Run it when:

- Bumping any `@codingame/monaco-vscode-*` package — the report plus a visual diff of the screenshots is what proves the bump didn't regress the clean-scoping property.
- Bumping the pinned `galaxy-workflows-vscode` commit — confirms the extension's contributed CSS hasn't started shipping global rules.
- Investigating a visual regression that might trace back to Monaco.

```bash
# Requires a Monaco-enabled gxwf-ui dist.
GXWF_E2E_INVENTORY=1 GXWF_E2E_SKIP_UI_BUILD=1 \
  pnpm --filter @galaxy-tool-util/gxwf-e2e exec playwright test \
  tests/_inventory-monaco-css.spec.ts

# Output at packages/gxwf-e2e/.inventory/
```

The inventory directory is gitignored.

## Upgrade procedure

For a `@codingame/monaco-vscode-*` bump:

1. Update every `@codingame/monaco-vscode-*` dep to the same new version (exact, no caret) in `packages/gxwf-ui/package.json`. Include the `monaco-editor` / `vscode` aliases. `pnpm install` to refresh the lockfile.
2. Run the normal e2e suite with a Monaco fixture present. `monaco-css-scoping.spec.ts` is the canary; if it fails, the new version has regressed selector scoping.
3. Run the inventory audit (`GXWF_E2E_INVENTORY=1 ...`) and review the `.inventory/` screenshots against a set captured on the previous version. Paste the REPORT.md into the PR description.
4. Commit the lockfile + `package.json` bump together. No changeset entry for a pinned-dev-dep bump unless the bump changes user-visible behavior.

For a `galaxy-workflows-vscode` bump:

1. Update `packages/gxwf-ui/EXT_COMMIT.md` (repo, branch, commit).
2. Rebuild the `.vsix` against the new commit; replace `packages/gxwf-ui/fixtures/galaxy-workflows.vsix`.
3. Rerun the e2e Monaco specs. Hover / diagnostics content may drift with the extension's schema — update the fixtures or assertions if the drift is expected.
4. Note the bump in the commit message; EXT_COMMIT.md is load-bearing for every downstream deploy.
