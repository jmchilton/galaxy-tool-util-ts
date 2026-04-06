---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

Decompose --strict into --strict-structure, --strict-encoding, --strict-state

Add three granular strict validation flags to all gxwf commands (validate, lint, convert, roundtrip + tree variants). --strict remains as shorthand for all three.

- --strict-structure: reject unknown keys via Effect Schema onExcessProperty: "error"
- --strict-encoding: reject JSON-string tool_state (native) and tool_state field misuse (format2)
- --strict-state: promote skipped/unconverted steps to failures (exit 2)

Schema package: new strict-checks.ts with checkStrictEncoding/checkStrictStructure, RoundtripResult gains encodingErrors/structureErrors with multi-stage validation, StepValidationResult gains skippedReason.
