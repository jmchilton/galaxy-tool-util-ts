# @galaxy-tool-util/cli

## 0.2.0

### Minor Changes

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `gxwf` CLI with validate, clean, lint, and convert subcommands plus tree (batch) variants for processing entire workflow directories. Single unified binary replaces prior tool-specific commands. Tree commands share a single tool cache load across all discovered workflows and produce aggregated summary reporting.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add stateful workflow conversion between native and format2 with tool-aware parameter coercion (booleans, numbers, arrays). Includes pre-conversion eligibility checks, subworkflow recursion, per-step status reporting, and schema-aware roundtrip validation that classifies benign artifacts (type coercion, stale keys) vs real differences.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Add `populate-workflow` and `structural-schema` commands to `galaxy-tool-cache` CLI. Add async external reference resolution for workflow imports supporting URL, base64, TRS, Galaxy @import, and file path strategies with cycle detection and depth limiting.

- [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4) Thanks [@jmchilton](https://github.com/jmchilton)! - Expand workflow validation with connection-aware state checking, legacy replacement parameter scanning, best-practices linting (annotations, creator, license, step labels), and format-specific validation paths. Add recursive tool state cleaning: stale key stripping, legacy JSON-encoded state decoding, and tool-aware pre-cleaning that respects declared parameter trees.

### Patch Changes

- Updated dependencies [[`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4), [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4), [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4), [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4), [`d850c42`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d850c428e83dcd7fd595816eb8040d46795bbcb4)]:
  - @galaxy-tool-util/schema@0.2.0
  - @galaxy-tool-util/core@0.2.0
