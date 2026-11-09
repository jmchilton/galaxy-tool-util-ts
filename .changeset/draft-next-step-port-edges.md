---
"@galaxy-tool-util/schema": minor
"@galaxy-tool-util/cli": minor
---

`nextDraftStep` work items now show the edges around a `TODO_*` port: an in port's sources (`sourced from 'reads'`, `no source: default value`, `no source: unwired`) and the steps consuming an out port (`consumed by 'second/TODO_input'`). `validateDraft` now reports a `TODO_*` input port with no source and no non-null default as a topology error, so `TODO_x: {}` fails `gxwf draft-validate`.
