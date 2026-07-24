# @galaxy-tool-util/tool-xml

XML tool-source layer for Galaxy tools. Holds the XML-specific parsing weight
(an XML parser dependency) out of the browser-safe `@galaxy-tool-util/schema`
package.

Currently ships a port of Galaxy's macro expander,
`lib/galaxy/util/xml_macros.py`: the XML-only, pre-parse transform that expands
`<macros>` — `<token>` substitution (including nested tokens and cycle
detection), `<xml>`/`<macro>` templates via `<expand>`, `<import>` of external
macro files, named/unnamed `yield`, and macro token parameters — mutating an
`XmlElement` tree in place.

```ts
import { loadTool, canonicalize } from "@galaxy-tool-util/tool-xml";

const expanded = loadTool("tool.xml"); // reads + expands macros
```

`parseXmlToTree(text)` parses XML into a mutable `XmlElement` tree;
`expandMacros(root, importResolver)` expands it (filesystem-agnostic);
`loadTool(path)` is the filesystem-backed convenience that resolves `<import>`
paths relative to the tool file. `canonicalize(el)` reduces a tree to a
whitespace-normalized shape for structural comparison.

Behavior is verified against golden macro-expansion fixtures synced from Galaxy
(`test/fixtures/macro-expansion/cases/`), compared structurally rather than
byte-for-byte so the port need not reproduce Galaxy's XML serializer.

On top of the expander, `XmlToolSource` ports the metadata-reading half of
Galaxy's `galaxy.tool_util.parser.xml.XmlToolSource` — the `parse_*` accessors
that don't need the input-parameter tree (id, version, name, description,
profile, license, edam operations/topics, xrefs, citations, help, command):

```ts
import { loadXmlToolSource } from "@galaxy-tool-util/tool-xml";

const src = loadXmlToolSource("tool.xml");
src.parseId(); // "cat1"
src.parseCitations(); // [{ type: "doi", content: "..." }]
```

Extraction is raw. In particular `parseCitations` does not yet apply the
model-level validation Galaxy's pydantic models run when the `ParsedTool` is
assembled — DOI/BibTeX shape checks, `doi:`-prefix stripping, and the
profile-gated skip of malformed citations. A `doi:`-prefixed or malformed
citation is passed through here rather than normalized or dropped.

Assembling these (plus inputs/outputs, behind the `InputSource` seam) into a
full `ParsedTool`, with that validation, is the remaining work; see the
repository's tool-parsing issue.
