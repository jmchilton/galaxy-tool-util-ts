---
"@galaxy-tool-util/schema": patch
---

Draft checks: parse sources with `resolveSourceReference` (step labels containing `/`), infer a subworkflow from `run:` when `type` is absent, treat list-form `in:` keys like dict-form ones in sentinel checks and next-step work, key unlabeled list-form steps by their normalized index id, and order extract output by codepoint instead of locale.
