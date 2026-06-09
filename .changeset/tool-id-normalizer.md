---
"@galaxy-tool-util/core": patch
"@galaxy-tool-util/cli": patch
---

fix: accept all tool-id forms uniformly + fix shadowed tool-version flags

Extract a single `toTrsToolId` normalizer (plus lenient `normalizeShortTrsToolId`)
in core, accepting the full ToolShed id (`toolshed.../repos/owner/repo/tool[/version]`),
the tilde form (`owner~repo~tool`), and the short slash form (`owner/repo/tool`),
mapping all to the TRS `owner~repo~tool` form. `resolveToolCoordinates` now normalizes
the short slash form, so `galaxy-tool-cache add`/`summarize` no longer 404 on TRS for
`owner/repo/tool`; `gxwf tool-versions`/`tool-revisions` now accept the full ToolShed id.
Stock tool ids (`cat1`, `upload1`) still pass through verbatim.

Also rename the `galaxy-tool-cache add`/`info`/`schema`/`summarize` version flag from
`--version` to `--tool-version`. Commander's program-level `--version` propagates to
subcommands and shadowed the old flag (it printed the CLI version instead of pinning the
tool version), so `--version` never worked on those commands. `--tool-version` matches the
existing `gxwf tool-revisions` convention. The spec validator now rejects any data option
that collides with commander's reserved `--version`/`--help` flags, so this class of bug
fails at build time instead of silently no-opping at runtime.
