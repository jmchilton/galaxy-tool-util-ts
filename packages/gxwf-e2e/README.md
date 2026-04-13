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

## Locators

UI components tag E2E-targeted elements with `data-description="..."` — Galaxy's
convention. Shared string constants live in `src/locators.ts`.
