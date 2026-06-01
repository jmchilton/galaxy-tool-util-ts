---
"@galaxy-tool-util/schema": patch
---

Expose `GalaxyWorkflowDraftSchema` / `DraftWorkflowStepSchema` (and their `GalaxyWorkflowDraft` / `DraftWorkflowStep` types) from the package root for downstream consumers. Previously reachable only at the deep `./workflow/raw` path; now importable as `import { GalaxyWorkflowDraftSchema } from "@galaxy-tool-util/schema"` alongside `GalaxyWorkflowSchema` / `NativeGalaxyWorkflowSchema`. Additive — no migration.
