import type { Citation, HelpContent, XrefDict } from "@galaxy-tool-util/schema";

import { parseXmlToTree } from "./element.js";
import type { XmlElement } from "./element.js";
import { expandMacros, type ImportResolver } from "./macros.js";
import { loadTool } from "./loader.js";

/**
 * Port of the metadata-reading half of ``galaxy.tool_util.parser.xml.XmlToolSource``.
 *
 * Wraps an already-macro-expanded {@link XmlElement} tool tree and exposes the
 * ``parse_*`` accessors that don't depend on the input-parameter tree (that
 * lives behind the ``InputSource`` seam and is added later). Extraction is raw
 * and does not yet apply the model-level validation/normalization Python's
 * pydantic models run when the `ParsedTool` is assembled — e.g. citation
 * `doi:`-prefix stripping, DOI/BibTeX shape checks, and the profile-gated skip
 * of malformed citations. Those land with the `ParsedTool` assembly step.
 */
export class XmlToolSource {
  static readonly language = "xml";

  readonly root: XmlElement;

  constructor(root: XmlElement) {
    this.root = root;
  }

  parseId(): string | null {
    return this.root.attrs.get("id") ?? null;
  }

  parseVersion(): string | null {
    return this.root.attrs.get("version") ?? null;
  }

  parseName(): string | null {
    return this.root.attrs.get("name") || this.parseId();
  }

  parseToolType(): string | null {
    return this.root.attrs.get("tool_type") ?? null;
  }

  parseDescription(): string {
    return xmlText(this.root, "description");
  }

  parseProfile(): string {
    // XML default differs from YAML's — pre-16.04 behaviour is the classic default.
    return this.root.attrs.get("profile") ?? "16.01";
  }

  parseLicense(): string | null {
    return this.root.attrs.get("license") ?? null;
  }

  parseEdamOperations(): string[] {
    return this.edamChildTexts("edam_operations", "edam_operation");
  }

  parseEdamTopics(): string[] {
    return this.edamChildTexts("edam_topics", "edam_topic");
  }

  private edamChildTexts(containerTag: string, itemTag: string): string[] {
    const container = this.root.findChild(containerTag);
    if (container === null) return [];
    return container.findChildren(itemTag).map((el) => el.text);
  }

  parseXrefs(): XrefDict[] {
    const xrefs = this.root.findChild("xrefs");
    if (xrefs === null) return [];
    const out: XrefDict[] = [];
    for (const xref of xrefs.findChildren("xref")) {
      const type = xref.attrs.get("type");
      // Mirror the `if xref.get("type") and xref.text` guard.
      if (type && xref.text) {
        out.push({ value: xref.text.trim(), type });
      }
    }
    return out;
  }

  parseCitations(): Citation[] {
    const citationsEl = this.root.findChild("citations");
    if (citationsEl === null) return [];
    const out: Citation[] = [];
    for (const child of citationsEl.children) {
      // `parse_citation_elem` ignores non-<citation> children.
      if (child.tag !== "citation") continue;
      const content = child.text.trim();
      // Raw extraction: skip empty content (Python's model asserts it) but do
      // NOT yet apply DOI/BibTeX shape validation, `doi:` normalization, or the
      // profile-gated skip of malformed citations — a `type`-less or malformed
      // citation is passed through here rather than dropped. See class docstring.
      if (!content) continue;
      const type = child.attrs.get("type") ?? "";
      out.push({ type, content });
    }
    return out;
  }

  parseHelp(): HelpContent | null {
    const helpEl = this.root.findChild("help");
    if (helpEl === null) return null;
    const format = helpEl.attrs.get("format") ?? "restructuredtext";
    return { format, content: helpEl.text || "" };
  }

  parseCommand(): string | null {
    const commandEl = this.root.findChild("command");
    return (commandEl && commandEl.text) || null;
  }
}

/**
 * ``galaxy.util.xml_text`` — attribute-first text lookup. Tries ``root``'s
 * ``name`` attribute, then the ``<name>`` child element's text with line
 * breaks collapsed and the result trimmed; ``default`` if neither is present.
 */
function xmlText(root: XmlElement, name: string, defaultValue = ""): string {
  const attr = root.attrs.get(name);
  if (attr) return attr;
  const elem = root.findChild(name);
  if (elem !== null && elem.text) {
    return elem.text
      .split(/\r\n|\r|\n/)
      .join("")
      .trim();
  }
  return defaultValue;
}

/** Build an {@link XmlToolSource} from raw XML text with a caller-supplied import resolver. */
export function xmlToolSourceFromString(
  text: string,
  importResolver: ImportResolver,
): XmlToolSource {
  return new XmlToolSource(expandMacros(parseXmlToTree(text), importResolver));
}

/** Load a tool XML file from disk, expand its macros, and wrap it as an {@link XmlToolSource}. */
export function loadXmlToolSource(path: string): XmlToolSource {
  return new XmlToolSource(loadTool(path));
}

/** Read raw XML text without resolving any ``<import>`` (throws if one is present). */
export function xmlToolSourceFromStringNoImports(text: string): XmlToolSource {
  return xmlToolSourceFromString(text, (relPath) => {
    throw new Error(`<import> not supported without a resolver: ${relPath}`);
  });
}
