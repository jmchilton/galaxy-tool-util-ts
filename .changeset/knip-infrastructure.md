---
---

Add `knip` for detecting unused files, dependencies, and exports. Two entry points:

- `pnpm lint:unused:ci` — strict subset (files/dependencies/unlisted/binaries/unresolved); wired into CI's lint job. Fails on dead files and missing/unused deps.
- `pnpm lint:unused` — full report including unused exports, for periodic one-off review.

Deletes dead barrel `packages/core/src/cache/storage/index.ts`, adds `@vitest/coverage-v8` as an explicit devDep (previously unlisted but required by `vitest.config.ts`).
