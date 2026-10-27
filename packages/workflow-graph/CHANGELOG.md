# @galaxy-tool-util/workflow-graph

## 1.15.0

### Minor Changes

- [#205](https://github.com/jmchilton/galaxy-tool-util-ts/pull/205) [`9ea1e0d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9ea1e0d58f541d68f4f37c7f205cf0c54a63f454) Thanks [@jmchilton](https://github.com/jmchilton)! - Add the Galaxy client's `applyRules` and `colHeadersFor` to the rules DSL (column tracking, per-rule `error`/`warn`, upload metadata columns) so Galaxy's rule builder can consume them. Python expressions now go through `pyre-to-regexp`, as in Galaxy's client; it is the package's first runtime dependency.

- [#205](https://github.com/jmchilton/galaxy-tool-util-ts/pull/205) [`187ee08`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/187ee082e18d17a34bb8f8705f77a105a84b8afb) Thanks [@jmchilton](https://github.com/jmchilton)! - Port Galaxy's rule builder DSL (`RuleSet`) to `workflow-graph`, checked against Galaxy's synced `rules_dsl_spec.yml`. Connection validation now types `collection_type_from_rules` outputs (e.g. `__APPLY_RULES__`) from the step's rules mapping, as Galaxy does, instead of skipping their edges ([#204](https://github.com/jmchilton/galaxy-tool-util-ts/issues/204)).

## 1.2.0

### Minor Changes

- [#77](https://github.com/jmchilton/galaxy-tool-util-ts/pull/77) [`e3ba439`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e3ba439976a703785ee93c5e4d69bb1f2e873ce5) Thanks [@jmchilton](https://github.com/jmchilton)! - Split `canMatch` into `accepts` (asymmetric subtype check, edge validation)
  and `compatible` (symmetric, sibling map-over checks). Mirrors the upstream
  Galaxy split. The `sample_sheet` asymmetry guard now lives inside `accepts`
  and `canMapOver` themselves rather than being deferred to caller-side
  decision logic. `canMatchAny` renamed to `acceptsAny`.

## 1.0.0

### Minor Changes

- [#64](https://github.com/jmchilton/galaxy-tool-util-ts/pull/64) [`95f7b7f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/95f7b7f260ddd04c59aa73e6885bee5bdd4dc61f) Thanks [@jmchilton](https://github.com/jmchilton)! - Extract pure collection-type algebra (`CollectionTypeDescription`,
  `canMatch`/`canMapOver`/`append`/`effectiveMapOver`, `NULL`/`ANY` sentinels),
  multi-accept variant helpers (`canMatchAny`, `effectiveMapOverAny`),
  `DatatypesMapperModel`, and the `producesAcceptableDatatype`/
  `ConnectionAcceptable` datatype-compatibility predicate from Galaxy's
  workflow editor into a new standalone package. Zero behavior change versus
  the Galaxy source; Galaxy consumes this back as re-exports.
