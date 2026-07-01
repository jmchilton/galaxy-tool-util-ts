---
"@galaxy-tool-util/cli": patch
---

fix(validate): fail a hallucinated stock-tool version pin instead of skipping it.
When tool-state validation resolves a built-in/stock step (bare id — `Cut1`,
`Show beginning1`, `__APPLY_RULES__`) and the pinned version misses but the shed
resolves the tool at a different concrete version, the pin is now reported as a
`fail` (`stock_version_mismatch`) rather than a silent `skip_tool_not_found`.
Closes the `gxwf draft-validate --concrete` loophole where a guessed stock
version validated green (#139). The offline / no-service path is unchanged: a
tool that can't be resolved at all still skips.
