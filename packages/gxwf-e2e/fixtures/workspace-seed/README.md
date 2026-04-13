# E2E fixture workspace seed

Copied to a fresh tmp dir before each test suite via `cloneWorkspace()`. Tests
mutate their clone freely; the seed stays read-only.

## IWC provenance

Copied from `galaxyproject/iwc` at commit `deafc4876f2c778aaf075e48bd8e95f3604ccc92`.

| Seed file | IWC path |
|---|---|
| `iwc/average-bigwig-between-replicates.ga` | `workflows/epigenetics/average-bigwig-between-replicates/average-bigwig-between-replicates.ga` |
| `iwc/parallel-accession-download.ga` | `workflows/data-fetching/parallel-accession-download/parallel-accession-download.ga` |
| `iwc/stale-keys.ga` | Same source as `average-bigwig-between-replicates.ga`, then mutated by `scripts/mutate-dirty.mjs` to inject stale keys (`__page__`, `__rerun_remap_job_id__`, `chromInfo`) plus `errors` / `uuid` on step 0 — so the clean operation has something to strip. |

To refresh any of these files, update the commit sha above and re-copy (and
re-run the mutation script for `stale-keys.ga`).

## Synthetic workflows

We have no production format2 fixtures, so `synthetic/` is hand-authored. These
are copied from `packages/schema/test/fixtures/workflows/format2/` where
applicable.

| Seed file | Origin |
|---|---|
| `synthetic/simple-format2.gxwf.yml` | `packages/schema/test/fixtures/workflows/format2/synthetic-basic.gxwf.yml` |
