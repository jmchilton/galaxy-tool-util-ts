---
"@galaxy-tool-util/workflow-graph": minor
---

Extract pure collection-type algebra (`CollectionTypeDescription`,
`canMatch`/`canMapOver`/`append`/`effectiveMapOver`, `NULL`/`ANY` sentinels),
multi-accept variant helpers (`canMatchAny`, `effectiveMapOverAny`),
`DatatypesMapperModel`, and the `producesAcceptableDatatype`/
`ConnectionAcceptable` datatype-compatibility predicate from Galaxy's
workflow editor into a new standalone package. Zero behavior change versus
the Galaxy source; Galaxy consumes this back as re-exports.
