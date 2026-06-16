---
"@galaxy-tool-util/core": patch
"@galaxy-tool-util/cli": patch
---

fix(cache): default unversioned stock/built-in tools to the `_default_` sentinel

`resolveToolCoordinates` returned `version: null` for non-ToolShed tool ids
(stock tools like `cat1`/`Cut1` and built-in collection ops like
`__APPLY_RULES__`/`__CROSS_PRODUCT_FLAT__`) that carry no explicit version. That
null short-circuited resolution, so these steps were reported as "no version
for …" and skipped — even though the json-schema validation path already used
the `_default_` convention, leaving the resolver internally inconsistent.

The stock-tool branch now mirrors the Python reference
(`ToolShedGetToolInfo._resolve_tool_coordinates`) and defaults the version to
`_default_`, so a cache key / schema-cache entry can be formed and the tool
resolves through the normal cache/fetch path instead of being skipped. Closes #128.
