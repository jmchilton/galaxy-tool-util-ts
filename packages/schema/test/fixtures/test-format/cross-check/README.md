# cross-check fixtures

Paired with `workflows/basic.gxwf.yml` + `workflows/basic.ga`. The workflow
declares three inputs (`input_file: File` required, `threshold: int` optional
default=5, `description: string` optional) and two outputs (`result`,
`summary`).

- `positive/` — tests that should cross-check clean against the workflow.
- `negative/` — each fixture exercises one diagnostic keyword:
  - `input_not_in_workflow-tests.yml` → `workflow_input_undefined`
  - `missing_required_input-tests.yml` → `workflow_input_required`
  - `input_type_mismatch-tests.yml` → `workflow_input_type`
  - `output_not_in_workflow-tests.yml` → `workflow_output_undefined`

All fixtures are also valid against `tests.schema.json` so the schema-level
validator leaves them alone; only cross-check produces diagnostics.
