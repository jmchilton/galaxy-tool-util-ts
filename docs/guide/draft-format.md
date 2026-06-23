# Draft Workflow Format

The **draft format** (`class: GalaxyWorkflowDraft`) is a relaxed superset of [Format2](glossary#format2) for workflows whose *topology is settled but whose tools are not yet resolved*. It lets a workflow have a fixed input/output shape and producer→consumer graph while individual tool steps still carry placeholders for the wrapper, its version, its port names, and its parameter state.

A draft is **not** a runnable Galaxy workflow. It is an interchange artifact: a partially-resolved workflow that any number of producers can emit and any number of consumers can read, validate, visualize, and incrementally resolve until it projects to runnable Format2.

> This page describes the format and the operations the library exposes for it. For CLI command flags and report formats, see [Workflow Operations](guide/workflow-operations.md). For the library API surface, see [Schema package — Draft Workflows](packages/schema.md).

## Why a draft tier

Format2 (`class: GalaxyWorkflow`) requires every tool step to name a concrete tool and carry valid state. That is the right contract for execution, but it is a poor fit for the moment *before* execution — when a workflow's shape is known but its tools are still being chosen. There is no spelling in Format2 for "this step takes these inputs and produces these outputs, but I haven't picked the wrapper yet."

The draft format fills that gap with two primitives:

- **`TODO` sentinels** — placeholders for wrapper-tier identifiers (tool id, version, port names) that are not yet resolved.
- **`_plan_*` fields** — free-text planning notes on a step capturing *intent* (what the step should do, what tool family fits, how its ports map) until the wrapper is chosen.

Both are wrapper-tier: each exists only because a step is not yet fully resolved, and both disappear the moment it is.

## What stays concrete, what may defer

The draft format draws a hard line between **topology** (always concrete) and the **wrapper tier** (may defer). The validator enforces it.

**Must be concrete — even in a draft:**

- Workflow input labels and their types. (The input `type` is sentinel-checked; the collection shape is part of the workflow's settled topology.)
- Workflow output labels.
- Step labels and step types (`tool`, `subworkflow`, `pause`, `pick_value`).
- The producer→consumer edge set: every `step/port` reference in a step input or an output `outputSource` must resolve to a declared step and one of its declared ports. (A `TODO_<hint>` port counts as declared if it appears in that step's `out:`.)

**May defer to a `TODO` sentinel:**

- `tool_id` and `tool_version`.
- `tool_shed_repository` (may be omitted entirely).
- `tool_state` / `state` (may be absent).
- Step input port keys (`in:`) and output port ids (`out:`), as `TODO_<hint>` placeholders.
- An output `outputSource` may reference a `TODO_<hint>` port on a step.

Because topology is fixed, the connection graph of a draft is already complete and analyzable — visualizers, type-flow checks, and "what feeds what" queries all work on a draft exactly as they would on a finished workflow. Only the boxes are incomplete, never the wiring.

## Sentinels

A sentinel is the literal string `TODO` or `TODO_<hint>`, matching:

```
^TODO(_[a-zA-Z0-9_]+)?$
```

The optional `<hint>` carries a semantic name that survives until resolution and drives prompts and tooltips — e.g. `TODO_trimmed_paired` for an output port, `TODO_input` for an input port. Bare `TODO` is fine for `tool_id` / `tool_version`; in a *port* position it is accepted but warned (prefer `TODO_<hint>`, which carries meaning a resolver can use).

TODO-*shaped* strings that don't match the canonical form — `TODO-foo`, a trailing `TODO_` — are reported as errors, so a typo'd sentinel can't silently pass as a real identifier. The check is anchored at a `TODO` / `TODO_` / `TODO-` boundary, so ordinary identifiers that merely start with those letters (`TODOLIST`) are left alone.

## Planning fields

Four optional free-text fields may appear on a draft tool step:

| Field | Captures |
|---|---|
| `_plan_state` | Parameter-binding intent — which knobs to set, value ranges, rationale. |
| `_plan_context` | Wrapper-selection context — source command, conda packages, containers, env vars, pre/postconditions. |
| `_plan_in` | Input-port mapping intent — semantic role of each input, likely wrapper-side port names. |
| `_plan_out` | Output-surface intent — which outputs downstream steps need preserved. |

`_plan_*` fields are draft-only and must be stripped before a workflow is treated as runnable Format2. As a contract check, a **tool step** that carries no TODO sentinels but still has `_plan_*` fields is an error — planning state must be cleaned up once the step is resolved. (Non-tool steps — subworkflow / pause / pick_value — are exempt from this check in v1.) A `_plan_*` field at the *workflow root* rather than on a step is a warning: planning notes belong on the steps they describe.

## A draft, sketched

```yaml
class: GalaxyWorkflowDraft
inputs:
  reads:
    type: collection
    collection_type: list:paired
outputs:
  trimmed:
    outputSource: fastp/TODO_trimmed_paired   # topology-final; port name pending
steps:
  fastp:
    tool_id: TODO                              # wrapper not yet chosen
    in:
      TODO_input: reads                        # port name pending; edge is concrete
    out:
      - id: TODO_trimmed_paired
    _plan_state: adapter trimming on; quality cutoff ~20
    _plan_context: conda fastp; container quay.io/biocontainers/fastp
    _plan_in: paired-collection reads on the wrapper's primary input
    _plan_out: keep the paired trimmed output for downstream mapping
```

Everything outside the `fastp` box — the input, its collection shape, the output, the edges — is concrete Format2. Only the wrapper tier of the step is deferred.

> **Step completeness is a spectrum, not a mode.** Because the relaxations are *per field*, a step can be anywhere between fully deferred (`tool_id: TODO` + `_plan_*`), identity-pinned (real `tool_id`, `tool_version: TODO`, parameters still in `_plan_state`), and fully resolved (concrete tool, bound state, no planning fields). These are just named combinations of the primitives above, not distinct formats.

## Operations

The library treats a draft as data with a small, composable operation set. Each is a pure function over the workflow document (the CLI commands are thin wrappers); together they cover the full lifecycle from "freshly emitted" to "promoted to runnable."

| Operation | Function(s) | Use |
|---|---|---|
| **Detect** | `isDraftWorkflow`, `detectDraft` | Route a document; survey every TODO + `_plan_*` with its step path. |
| **Validate** | `validateDraft` | Structure + topology + sentinel-form + warnings, collected (never throws). |
| **Survey next work** | `nextDraftStep` | Topologically-ordered "what to resolve next," as a prompt-shaped `work[]`. |
| **Project to concrete** | `extractConcreteSubset` | Trim to the subset that could run today; cascade-drop dead consumers; rewrite multi-source inputs. |
| **Strip + promote** | `stripPlanFields`, `promoteFullyConcreteDrafts` | Remove `_plan_*`; flip `class` to `GalaxyWorkflow` once nothing drafty remains. |
| **Visualize** | `resolveDraftOverlay`, `PLANNED_CLASS` | Mark planned nodes/edges so diagram builders can style them distinctly. |
| **Schema** | `GalaxyWorkflowDraftSchema`, `galaxyWorkflowDraftJsonSchema` | Effect schema + a plain JSON Schema (2020-12) sibling for editors and external validators. |

### Validate

`validateDraft` decodes the document loosely against the draft schema, then enforces the concrete-topology rules above, then flags malformed sentinels and warnings. It returns structured buckets (`structureErrors`, `topologyErrors`, `semanticErrors`, `warnings`) plus the survey — it never throws, so a CI job or editor can render every problem at once. The `gxwf draft-validate --concrete` mode goes further: it projects the draft to its runnable subset (below) and runs the Format2 validation checks on that subset — structure and (by default) tool state, plus connection-type checks when `--connections` is passed.

### Resolve, step by step

`nextDraftStep` walks the steps in topological order (alphabetical tie-break) and returns the first one with outstanding work, as a list of human/agent-readable items (one per `work[]` entry; the second is soft-wrapped below):

```
TODO[tool_id]: pick a Galaxy Tool Shed wrapper for this step
TODO[out.TODO_trimmed_paired]: assign the real wrapper output port name
  (semantic hint: 'trimmed_paired'; referenced by workflow output 'trimmed')
```

It is pure and idempotent — same draft in, byte-identical work list out — so it drives an agent loop (resolve → re-run → repeat) or an IDE "outstanding tasks" panel without any hidden state.

### Project to runnable

`extractConcreteSubset` answers "what part of this draft could run *right now*?" It drops every step carrying a TODO or `_plan_*`, then cascade-drops any step left with no live inputs, then drops workflow outputs whose source went away — rewriting multi-source inputs to their surviving subset and reporting every drop and rewrite. Running `stripPlanFields` + `promoteFullyConcreteDrafts` afterward removes planning notes and flips `class: GalaxyWorkflowDraft → GalaxyWorkflow` on any (sub)workflow that is now fully concrete.

This is the **runnable-projection** property that makes the format safe to adopt: a *fully-resolved* draft strips and promotes to ordinary Format2, byte-compatible with every existing gxformat2 tool. Drafts are not valid gxformat2 while drafty — but resolution is a one-way door back to it.

### Visualize

`resolveDraftOverlay` classifies which rendered nodes (and, by inference, edges) are *planned* vs. concrete and why, keyed to match how the diagram builders look up steps. The shared `PLANNED_CLASS` token (`"planned"`) lets [Mermaid](guide/workflow-operations.md) and Cytoscape renderers style draft regions distinctly — an editor preview can show, at a glance, which parts of a workflow are still placeholders. The CLI diagram commands apply the overlay automatically for drafts (disable with `--no-draft-overlay`).

## Plugging into a pipeline, IDE, or agent

The format deliberately separates **producers** (who emit drafts) from **consumers** (who operate on them); neither needs to know the other exists.

**Producers** emit a draft with concrete topology and deferred wrappers:

- An LLM or agent that designs a workflow's shape before choosing tools.
- An IDE wizard or scaffolding tool that lays out steps and edges for a user to fill in.
- A translator from another DAG language that maps structure first, tools later.

**Consumers** each plug into one operation:

- **CI / linting** → `validateDraft` to gate drafts on concrete-topology correctness.
- **Editors** → `galaxyWorkflowDraftJsonSchema` for autocomplete and inline validation in any language; `resolveDraftOverlay` for a planned/concrete preview.
- **Agent loops** → `nextDraftStep` to get the next unit of work, resolve it, and re-run to convergence.
- **Promotion gates** → `extractConcreteSubset` + `promoteFullyConcreteDrafts` to project the runnable subset and hand it to any gxformat2 executor.

Because every operation is a pure function over a plain document and the schema is exported as standard JSON Schema, none of this is tied to a particular host, language, or pipeline.

## See also

- [Workflow Operations](guide/workflow-operations.md) — `gxwf draft-validate` / `draft-extract` / `draft-next-step` CLI flags, exit codes, and report formats.
- [Schema package](packages/schema.md) — the exported draft functions and types in detail.
- [Workflow Validation](guide/workflow-validation.md) — the Format2 / native validation the `--concrete` projection runs.
- **Galaxy Foundry research notes** — one concrete application of this format. Foundry's [`galaxy-workflow-draft-format`](https://github.com/galaxyproject/foundry/blob/main/content/research/galaxy-workflow-draft-format.md) describes an LLM workflow-authoring pipeline that designs topology upstream and resolves wrappers downstream, layering its own policy (resolution tiers, topology-repair escalation) on top of this format. Its companion [`galaxy-data-flow-draft-contract`](https://github.com/galaxyproject/foundry/blob/main/content/research/galaxy-data-flow-draft-contract.md) describes a *separate, upstream* artifact — an abstract data-flow DAG (`nodes`, `edges`, `galaxy_idioms`, `confidence`, …) that such a pipeline would translate *into* this draft format. That abstract contract is not implemented here; this page covers only the gxformat2-tier draft.
```