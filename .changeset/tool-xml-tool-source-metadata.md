---
"@galaxy-tool-util/tool-xml": minor
---

Add `XmlToolSource` — the metadata-reading half of Galaxy's `galaxy.tool_util.parser.xml.XmlToolSource`. Wraps a macro-expanded XML tree and exposes the `parse_*` accessors that don't depend on the input-parameter tree: id, version, name, tool_type, description (`xml_text` attribute-first), profile (XML `16.01` default), license, edam operations/topics, xrefs, citations, help, and command. Includes `loadXmlToolSource(path)` and string-based constructors. Assembly into a full `ParsedTool` (inputs/outputs, behind the InputSource seam) is still to come.
