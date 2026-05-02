# @galaxy-tool-util/workflow-graph

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
