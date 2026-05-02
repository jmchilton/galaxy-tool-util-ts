# Cytoscape Layout Algorithm Spec

Normative cross-language spec for the `topological` layout emitted by
`gxwf cytoscapejs --layout topological` (TypeScript) and the planned
`gxformat2 gxwf-viz --layout topological` (Python). Both implementations MUST
produce byte-identical `CytoscapePosition` values for a given input.

## Constants

```
COL_STRIDE = 220
ROW_STRIDE = 100
```

Both are positive integers. No float math anywhere in the algorithm.

## Inputs

The algorithm operates on an already-built `CytoscapeElements` value, after
nodes and edges have been emitted in NF2 declaration order (inputs first, then
steps in `nf2.steps` order). Concretely:

- `elements.nodes`: list of `CytoscapeNode`, with stable **declaration index**
  `i` ∈ [0, len(nodes)).
- `elements.edges`: list of `CytoscapeEdge` with `data.source` / `data.target`
  referring to node `data.id` values.

`data.id` is the NF2 step label (or NF2 input id). Edges referencing a
`data.source` that is not in `elements.nodes` are **ignored** (consistent with
the builder, which emits edges before validating).

## Algorithm

1. **Adjacency.** For every edge `e`, if both `e.data.source` and
   `e.data.target` resolve to nodes in `elements.nodes`, append
   `e.data.source` to `incoming[e.data.target]`.

2. **Column assignment (longest-path layering).** Initialise
   `column[id] = 0` for every node. Iterate nodes in **declaration order** and
   process via Kahn-style topological sort:

   - Start with nodes that have no entries in `incoming`.
   - For each node `n` popped in topo order, set
     `column[n] = max(column[s] for s in incoming[n]) + 1` if `incoming[n]`
     is non-empty; else leave it at 0.
   - Topo-sort tie-break: when multiple nodes have zero remaining in-degree,
     pop the one with the **lowest declaration index** first (deterministic).

   Any node not reached by the topo sort (i.e. participating in a cycle) gets
   `column[n] = i_n`, its declaration index. Galaxy workflows are DAGs by
   construction; this branch exists only so malformed inputs don't crash.

3. **Row assignment.** For each column `c`, collect the nodes assigned to
   `c` in **declaration order** (i.e. preserving the relative order from
   `elements.nodes`). Assign `row[n] = j` where `j` is the 0-based index of
   `n` within that list.

4. **Coordinates.**
   ```
   x = column * COL_STRIDE
   y = row    * ROW_STRIDE
   ```
   `(x, y)` are integers; both implementations produce them as integers (no
   `.0` suffix when serialized to JSON).

## Disconnected components

Disconnected components fall out of the algorithm naturally:

- All component roots land in column 0.
- Rows within a column are global (per-column, not per-component), so
  components stack vertically inside column 0 and propagate rightwards
  independently.

This means two parallel chains `A → B → C` and `X → Y → Z` render as two
horizontal lanes:

```
A   B   C
X   Y   Z
```

Not as four columns side-by-side. This is intentional: it keeps the column
counter independent of component-detection, which would otherwise be a
second source of cross-language drift.

## What this spec does **not** cover

- The `preset` layout: bytes-identical to the pre-`--layout` builder output
  (positions from `step.position` or `(10*i, 10*i)` fallback). No layering.
- Hint-only layouts (`dagre`, `breadthfirst`, `grid`, `cose`, `random`):
  these omit `data.position` entirely and emit a top-level
  `layout: { name: "<n>" }` hint. The runtime renderer (cytoscape.js in the
  HTML template or in `gxwf-ui`) computes positions at view time. There is
  no cross-language coordinate contract for hint-only layouts.

## Cross-language parity test

A small set of fixtures (linear chain, diamond, fan-out, fan-in, two
disconnected chains) is checked into both repos with hard-coded
`(x, y)` expectations. Any change to this spec — including stride values or
tie-break rules — is a breaking visual diff and must update both repos in
lockstep.
