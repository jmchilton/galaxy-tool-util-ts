# @galaxy-tool-util/workflow-graph

Pure collection-type algebra and datatype subtyping primitives extracted verbatim from Galaxy's workflow editor (`client/src/components/Workflow/Editor/modules/` and `client/src/components/Datatypes/`). Consumed by Galaxy itself, the [workflow connection validator](guide/workflow-validation.md) in this monorepo, and downstream tooling (CLI, gxwf-ui, future VS Code plugin).

Pure TypeScript / ESM. The only runtime dependency is [`pyre-to-regexp`](https://github.com/jmchilton/pyre-to-regexp), used by the rule builder DSL, as in Galaxy's client.

## Algebra reference

The collection-type algebra (the lattice, the semantics of `accepts` / `compatible` / `can_map_over`, the `sample_sheet` asymmetry, worked examples) is documented Galaxy-side and intentionally **not** duplicated here:

→ [`collection_semantics.yml`](https://github.com/galaxyproject/galaxy/blob/dev/lib/galaxy/model/dataset_collections/types/collection_semantics.yml) (Type Compatibility Algebra section)

This page covers only what's TypeScript-specific.

## Collection types

### `CollectionTypeDescriptor` (interface) and `CollectionTypeDescription` (class)

The interface is implemented by both the regular class **and** the two sentinel object literals. Don't `instanceof`-check — use reference equality against the sentinels:

```typescript
import {
  CollectionTypeDescription,
  NULL_COLLECTION_TYPE_DESCRIPTION,
  ANY_COLLECTION_TYPE_DESCRIPTION,
} from "@galaxy-tool-util/workflow-graph";

if (ct === NULL_COLLECTION_TYPE_DESCRIPTION) { /* ... */ }    // ✓
if (ct instanceof CollectionTypeDescription) { /* ... */ }    // ✗ misses sentinels
```

`NULL_COLLECTION_TYPE_DESCRIPTION` represents "not a collection". `ANY_COLLECTION_TYPE_DESCRIPTION` represents a collection input with no declared `collection_type` — it accepts any non-null collection but cannot be mapped over.

### Three operations

| Operation | Symmetric? | Use site | Direction |
|---|---|---|---|
| `accepts(other)` | no | edge validation | `input.accepts(output)` |
| `compatible(other)` | yes | sibling map-over checks where neither side is the input slot | n/a |
| `canMapOver(other)` | no | output mappability | `output.canMapOver(input)` |

`compatible` is defined as `this.accepts(other) || other.accepts(this)` — use it whenever order-of-arrival shouldn't change the answer (e.g. checking that two siblings can drive a common map-over).

### Cross-language correspondence

Names are kept aligned with the Python implementation under `lib/galaxy/model/dataset_collections/type_description.py` so cross-references read 1:1:

| TypeScript | Python |
|---|---|
| `accepts` | `accepts` |
| `compatible` | `compatible` |
| `canMapOver` | `can_map_over` |
| `effectiveMapOver` | `effective_map_over` |

### Variant-array helpers

`acceptsAny` and `effectiveMapOverAny` exist only on the TS side. They factor out the inner loop of Galaxy's `InputCollectionTerminal._effectiveMapOver` for inputs that declare multiple accepted `collection_types`. Python has no equivalent — Galaxy's Python terminals iterate inline.

```typescript
import { acceptsAny, effectiveMapOverAny } from "@galaxy-tool-util/workflow-graph";

const variants = [new CollectionTypeDescription("list"), new CollectionTypeDescription("list:paired")];
acceptsAny(output, variants);          // any variant accepts the output?
effectiveMapOverAny(output, variants); // computed map-over, or NULL
```

The `sample_sheet` asymmetry guard lives inside `accepts` and `canMapOver` themselves, so callers don't need to re-check it for the simple cases. Galaxy's `InputCollectionTerminal.canAccept` keeps a defense-in-depth re-check for compound effective types — that remains a caller-side concern.

### `isValidCollectionTypeStr(s)`

Regex-validates a collection-type string against the grammar (`list`, `paired`, `paired_or_unpaired`, `record`, `sample_sheet*`, and colon-compositions thereof).

## Datatype subtyping

### `DatatypesMapperModel`

Wraps a `DatatypesCombinedMap` (Galaxy's serialized class hierarchy) and exposes:

- `isSubType(child, parent)` — true if `child` is registered as a subtype of `parent`.
- `isSubTypeOfAny(child, parents)`
- `getParentDatatype(extension)` — extracts the parent module segment from the registered class name.

### `DatatypesCombinedMap`

A minimal hand-written equivalent of Galaxy's generated `components["schemas"]["DatatypesCombinedMap"]`. The Galaxy-side re-export site enforces structural compatibility at compile time, so drift gets caught loudly.

### `producesAcceptableDatatype(mapper, inputDatatypes, otherDatatypes)`

Returns a `ConnectionAcceptable` (`{ canAccept, reason }`) describing whether any of `otherDatatypes` is acceptable for any of `inputDatatypes`, accounting for the `input` and `_sniff_` wildcards and the subtype hierarchy. Used by the connection validator to produce human-readable rejection reasons.

## Rule builder DSL

### `RuleSet`

Port of Galaxy's `galaxy.util.rules_dsl.RuleSet`, the rule builder behind `__APPLY_RULES__` and rule-based uploads. Conformance is checked against Galaxy's [`rules_dsl_spec.yml`](https://github.com/galaxyproject/galaxy/blob/dev/lib/galaxy/util/rules_dsl_spec.yml), synced with `make sync-rules-dsl-spec`.

```typescript
import { RuleSet } from "@galaxy-tool-util/workflow-graph";

const ruleSet = new RuleSet(toolState.rules);
ruleSet.collectionType;               // e.g. "list:paired", "" when nothing is mapped
ruleSet.hasErrors;                    // any rule fails validation
const [data, sources] = ruleSet.apply(rows, elementSources);
```

`collectionType` reads only the mapping, so it doesn't depend on the rules validating. The connection validator uses it to type `collection_type_from_rules` outputs.

### `applyRules` and `colHeadersFor`

Port of the pure part of Galaxy's client `RuleBuilder/rule-definitions.js`, so the rule builder can import it instead of carrying its own copy. It shares rule implementations with `RuleSet` but follows the client's contract:

```typescript
import { applyRules, colHeadersFor } from "@galaxy-tool-util/workflow-graph";

const { data, sources, columns, colHeadersPerRule } = applyRules(rows, elementSources, columns, rules);
rules[0].error; // failing rule's message; later rules get `warn` = SKIPPED_RULE_WARNING
```

- No validation: rules run as given, and errors land on `rule.error` instead of being thrown.
- `columns` tracks one marker per table column (`"new"` for added ones) through add, remove, swap and split rules. The caller's array isn't mutated.
- `add_column_metadata` also reads `hid`, `name`, `path` and `uri` from upload sources, which Python rejects.
- The rule display metadata (`title`, `display`, `init`, `save`) stays in Galaxy.

Differences from the current client code: a non-numeric cell in `add_filter_compare` or a numeric `sort` is an error rather than `NaN`; `remove_columns` and `split_columns` drop header markers (the client's `removeColumns` compares string indices and never removes any); `add_column_group_tag_value` defaults to `""` rather than `undefined`; an unknown rule type is an error rather than a crash.

### Expressions

Expressions use Python `re` syntax and go through `pyre-to-regexp`, as in Galaxy's client: `(?P<name>…)` groups and `\1`, `\g<1>`, `\g<name>` replacements are translated. Backreferences like `(?P=name)` and other dialect differences are not; a replacement naming a missing group is left as a literal `$n` rather than raising as Python would.
