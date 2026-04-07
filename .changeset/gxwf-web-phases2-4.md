---
"@galaxy-tool-util/gxwf-web": minor
---

Add workflow operations (validate, lint, clean, to-format2, to-native, roundtrip), OpenAPI client type generation, and query param parity with Python server. Exports typed `paths`/`components`/`operations` from vendored OpenAPI spec; `--output-schema` CLI flag outputs the spec. All validate/lint/clean params now accepted (allow/deny/preserve/strip are no-ops pending StaleKeyPolicy; strict/connections/mode wired). 67 tests.
