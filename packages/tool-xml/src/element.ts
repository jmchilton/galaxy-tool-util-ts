import { XMLParser } from "fast-xml-parser";

/**
 * A minimal, mutable XML element tree modeled on Python's
 * ``xml.etree.ElementTree.Element`` — enough to faithfully port
 * ``galaxy.util.xml_macros`` (macro expansion) and to compare expanded trees
 * structurally against golden fixtures.
 *
 * ``text`` mirrors ElementTree's ``.text``: the character data immediately
 * following the start tag and preceding the first child element. Trailing /
 * inter-element ("tail") text is not modeled — it is whitespace-only in tool
 * XML and is normalized away by {@link canonicalize}.
 */
export class XmlElement {
  tag: string;
  /** Attributes in document order. */
  attrs: Map<string, string>;
  /** Leading text content (ElementTree ``.text``); "" when absent. */
  text: string;
  children: XmlElement[];
  parent: XmlElement | null;

  constructor(tag: string) {
    this.tag = tag;
    this.attrs = new Map();
    this.text = "";
    this.children = [];
    this.parent = null;
  }

  /** Deep copy with a detached parent (mirrors ``copy.deepcopy``). */
  clone(): XmlElement {
    const copy = new XmlElement(this.tag);
    copy.attrs = new Map(this.attrs);
    copy.text = this.text;
    for (const child of this.children) {
      const childCopy = child.clone();
      childCopy.parent = copy;
      copy.children.push(childCopy);
    }
    return copy;
  }

  /** Remove all children, attributes and text (mirrors ``Element.clear``). */
  clear(): void {
    this.attrs = new Map();
    this.text = "";
    this.children = [];
  }

  /** First direct child with the given tag, or null (mirrors ``find(tag)``). */
  findChild(tag: string): XmlElement | null {
    for (const child of this.children) {
      if (child.tag === tag) return child;
    }
    return null;
  }

  /** Direct children with the given tag (mirrors ``findall(tag)``). */
  findChildren(tag: string): XmlElement[] {
    return this.children.filter((c) => c.tag === tag);
  }

  /**
   * First descendant (excluding self) matching ``tag`` in document order —
   * mirrors ``Element.find(".//tag")``.
   */
  findFirstDescendant(tag: string): XmlElement | null {
    for (const child of this.children) {
      if (child.tag === tag) return child;
      const found = child.findFirstDescendant(tag);
      if (found) return found;
    }
    return null;
  }

  /**
   * All descendants (excluding self) matching ``tag`` (and optional predicate)
   * in document order — mirrors ``Element.findall(".//tag")``.
   */
  findAllDescendants(tag: string, predicate?: (el: XmlElement) => boolean): XmlElement[] {
    const out: XmlElement[] = [];
    const walk = (el: XmlElement): void => {
      for (const child of el.children) {
        if (child.tag === tag && (!predicate || predicate(child))) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

// ---------------------------------------------------------------------------
// Parsing (fast-xml-parser preserveOrder tree → XmlElement)
// ---------------------------------------------------------------------------

const PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  attributesGroupName: ":@",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  cdataPropName: "#cdata",
  // No commentPropName → comments are dropped (matches remove_comments=True).
});

type PoNode = Record<string, unknown>;

/** Text carried by a preserveOrder "#text"/"#cdata" node, else null. */
function nodeText(node: PoNode): string | null {
  if ("#text" in node) return String(node["#text"]);
  if ("#cdata" in node) {
    const parts = node["#cdata"] as PoNode[];
    return parts.map((p) => ("#text" in p ? String(p["#text"]) : "")).join("");
  }
  return null;
}

/** Tag name of a preserveOrder element node (the non-special, non-attrs key). */
function nodeTag(node: PoNode): string | null {
  for (const key of Object.keys(node)) {
    // Skip attribute group, text/cdata specials, and the "?xml"/PI declaration.
    if (key === ":@" || key.startsWith("#") || key.startsWith("?")) continue;
    return key;
  }
  return null;
}

function buildElement(node: PoNode): XmlElement | null {
  const tag = nodeTag(node);
  if (tag === null) return null;
  const el = new XmlElement(tag);

  const rawAttrs = node[":@"] as Record<string, unknown> | undefined;
  if (rawAttrs) {
    for (const [k, v] of Object.entries(rawAttrs)) el.attrs.set(k, String(v));
  }

  const childNodes = (node[tag] as PoNode[] | undefined) ?? [];
  let sawElement = false;
  for (const child of childNodes) {
    const text = nodeText(child);
    if (text !== null) {
      // Leading text only (before the first child element); tails are dropped.
      if (!sawElement) el.text += text;
      continue;
    }
    const childEl = buildElement(child);
    if (childEl) {
      childEl.parent = el;
      el.children.push(childEl);
      sawElement = true;
    }
  }
  return el;
}

/** Parse XML text into an {@link XmlElement} tree, returning the root element. */
export function parseXmlToTree(text: string): XmlElement {
  const parsed = PARSER.parse(text) as PoNode[];
  for (const node of parsed) {
    const el = buildElement(node);
    if (el) return el;
  }
  throw new Error("No root element found in XML input.");
}

// ---------------------------------------------------------------------------
// Structural comparison
// ---------------------------------------------------------------------------

export interface CanonicalElement {
  tag: string;
  text: string;
  attrs: Record<string, string>;
  children: CanonicalElement[];
}

/**
 * Reduce an element tree to a whitespace-normalized, serializer-independent
 * shape for structural comparison: tag, trimmed text, attributes (compared
 * order-insensitively), and ordered children.
 */
export function canonicalize(el: XmlElement): CanonicalElement {
  return {
    tag: el.tag,
    text: el.text.trim(),
    attrs: Object.fromEntries(el.attrs),
    children: el.children.map(canonicalize),
  };
}

/**
 * Insert deep copies of ``targets`` where ``query`` sits among its parent's
 * children, then remove ``query`` — port of ``xml_macros._xml_replace``.
 */
export function xmlReplace(query: XmlElement, targets: XmlElement[]): void {
  const parent = query.parent;
  if (parent === null) throw new Error("xmlReplace: element has no parent");
  const index = parent.children.indexOf(query);
  if (index < 0) throw new Error("xmlReplace: element not found in parent");
  const clones = targets.map((t) => {
    const c = t.clone();
    c.parent = parent;
    return c;
  });
  parent.children.splice(index, 1, ...clones);
}
