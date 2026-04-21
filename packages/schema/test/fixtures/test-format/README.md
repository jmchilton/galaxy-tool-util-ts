# Workflow-test format fixtures

Canonical fixtures for `galaxy.tool_util_models.Tests` (Pydantic source of
truth) and the JSON Schema vendored at
`packages/schema/src/test-format/tests.schema.json`.

Shared across:

- `@galaxy-tool-util/schema` unit tests (`test/test-format.test.ts`)
- `@galaxy-tool-util/cli` `gxwf validate-tests` / `validate-tests-tree` tests
- downstream consumers (galaxy-workflows-vscode plugin tests, Galaxy-side
  Python interop tests)

## Layout

- `positive/*.yml` — docs that must validate successfully.
- `negative/*.yml` — docs that must fail validation (schema-level only; any
  cross-field/semantic checks live in the consumer).

Each file is a complete, stand-alone test document (top-level YAML list of
test entries). Keep filenames descriptive — they appear in test output.
