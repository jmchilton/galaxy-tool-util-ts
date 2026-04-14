# @galaxy-tool-util/gxwf-e2e

Playwright end-to-end tests for `gxwf-web` backend + `gxwf-ui` frontend.

## Running

```bash
# One-time: install chromium (at monorepo root)
pnpm exec playwright install chromium

# Full e2e run (builds gxwf-ui first)
pnpm --filter @galaxy-tool-util/gxwf-e2e test

# Skip rebuild if gxwf-ui/dist is already current
GXWF_E2E_SKIP_UI_BUILD=1 pnpm --filter @galaxy-tool-util/gxwf-e2e test

# Headed / UI modes
pnpm --filter @galaxy-tool-util/gxwf-e2e test:headed
pnpm --filter @galaxy-tool-util/gxwf-e2e test:ui
```

## Fixture workspace

`fixtures/workspace-seed/` is copied to a fresh tmp dir for every test suite via
`cloneWorkspace()`. Suites freely mutate their clone; cleanup happens in
`afterAll`.

- `iwc/` — copies of selected IWC workflows (see `fixtures/workspace-seed/README.md`
  for provenance)
- `synthetic/` — hand-authored format2 workflows (we have no production format2
  fixtures in the wild)

## Monaco editor specs (opt-in)

The `monaco-*.spec.ts` suites exercise the opt-in Monaco integration in
`gxwf-ui`. They self-skip unless `packages/gxwf-ui/fixtures/galaxy-workflows.vsix`
is present. Build it once per box:

1. Clone `galaxy-workflows-vscode` at the sha in
   `packages/gxwf-ui/EXT_COMMIT.md`.
2. `pnpm install && pnpm build` inside that clone.
3. `npx @vscode/vsce package --no-dependencies` → `galaxy-workflows-<ver>.vsix`.
4. Copy to `packages/gxwf-ui/fixtures/galaxy-workflows.vsix`.

`global-setup.ts` detects the fixture and builds `gxwf-ui` with
`VITE_GXWF_MONACO=1`, `VITE_GXWF_EXT_SOURCE=vsix:/ext/galaxy-workflows.vsix`,
and `VITE_GXWF_EXPOSE_MONACO=1`. It also sets `GXWF_E2E_MONACO=1` in the test
process so specs can detect the opt-in at import time.

Neither the `.vsix` nor the staged copy under `packages/gxwf-ui/public/ext/`
is committed; default builds (and fresh-clone CI) stay Monaco-free.

## Locators

UI components tag E2E-targeted elements with `data-description="..."` — Galaxy's
convention. Shared string constants live in `src/locators.ts`.
