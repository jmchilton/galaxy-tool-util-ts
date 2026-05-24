---
"@galaxy-tool-util/cli": patch
---

`gxwf validate`: refuse `--json` + `--report-html` to stdout in a single run — exit 2 with an explicit error instead of silently interleaving JSON + HTML on stdout. Mirrors the same fix that landed for `draft-validate`. File destinations for `--report-html` continue to work alongside `--json`. (Same latent bug still exists for `gxwf lint` and `gxwf clean`; out of scope for this commit.)
