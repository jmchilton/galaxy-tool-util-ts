# @galaxy-tool-util/workflow-graph

## 1.0.0

### Minor Changes

- [#64](https://github.com/jmchilton/galaxy-tool-util-ts/pull/64) [`95f7b7f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/95f7b7f260ddd04c59aa73e6885bee5bdd4dc61f) Thanks [@jmchilton](https://github.com/jmchilton)! - Extract pure collection-type algebra (`CollectionTypeDescription`,
  `canMatch`/`canMapOver`/`append`/`effectiveMapOver`, `NULL`/`ANY` sentinels),
  multi-accept variant helpers (`canMatchAny`, `effectiveMapOverAny`),
  `DatatypesMapperModel`, and the `producesAcceptableDatatype`/
  `ConnectionAcceptable` datatype-compatibility predicate from Galaxy's
  workflow editor into a new standalone package. Zero behavior change versus
  the Galaxy source; Galaxy consumes this back as re-exports.
