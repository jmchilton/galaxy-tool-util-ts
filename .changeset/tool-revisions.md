---
"@galaxy-tool-util/cli": minor
"@galaxy-tool-util/search": minor
---

Add `gxwf tool-revisions <tool-id>` for resolving a Tool Shed tool to the
changeset revisions that publish it — needed for emitting workflows pinned
on `(name, owner, changeset_revision)` for reproducible reinstall.

- Accepts both `owner~repo~tool_id` and `owner/repo/tool_id` forms.
- `--tool-version <v>` restricts to revisions that publish that exact tool
  version.
- `--latest` prints only the newest matching revision (per
  `get_ordered_installable_revisions` order).
- `--json` emits `{ trsToolId, version?, revisions: [{ changesetRevision,
  toolVersion }] }`. Exit codes: `0` on hits, `2` on empty, `3` on fetch
  error.

Exports `getToolRevisions(toolshedUrl, { owner, repo, toolId, version? })`
from `@galaxy-tool-util/search` for non-CLI consumers. Implementation uses
the 3-call dance over `/api/repositories?owner=…&name=…`,
`/api/repositories/{id}/metadata?downloadable_only=true`, and
`get_ordered_installable_revisions` — no Tool Shed change required.
