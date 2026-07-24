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

Building the full `XmlToolSource` → `ParsedTool` front end on top of this
expander is planned; see the repository's tool-parsing issue.
