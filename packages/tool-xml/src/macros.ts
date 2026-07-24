import { xmlReplace } from "./element.js";
import type { XmlElement } from "./element.js";

/**
 * Port of ``galaxy.util.xml_macros`` — the XML-only, pre-parse transform that
 * expands ``<macros>`` (``<token>`` substitution, ``<xml>``/``<macro>``
 * templates via ``<expand>``, ``<import>`` of macro files, and named/unnamed
 * ``yield``). Operates on and mutates an {@link XmlElement} tree in place.
 */

/** type name → macro elements of that type (token / xml / template / ...). */
type MacrosDict = Map<string, XmlElement[]>;

/** Resolve an ``<import>`` path to the parsed root of that macros file. */
export type ImportResolver = (relativePath: string) => XmlElement;

/** Representation of a (Galaxy) ``<xml>`` macro and its parameter tokens. */
export class XmlMacroDef {
  element: XmlElement;
  tokenQuote: string;
  /** param name → default value (null marks a required parameter). */
  tokens: Map<string, string | null>;

  constructor(el: XmlElement) {
    this.element = el;
    this.tokenQuote = "@";
    this.tokens = new Map();
    for (const [key, value] of el.attrs) {
      if (key === "token_quote") {
        this.tokenQuote = value;
      }
      if (key === "tokens") {
        for (const token of value.split(",")) this.tokens.set(token, null);
      } else if (key.startsWith("token_")) {
        this.tokens.set(key.slice("token_".length), value);
      }
    }
  }

  /** Map macro-parameter token names (quoted, upper-cased) to their values. */
  macroTokens(expandEl: XmlElement): Map<string, string> {
    const tokens = new Map<string, string>();
    for (const [key, defaultVal] of this.tokens) {
      const tokenValue = expandEl.attrs.has(key) ? expandEl.attrs.get(key)! : defaultVal;
      if (tokenValue === null) {
        throw new Error(`Failed to expand macro - missing required parameter [${key}].`);
      }
      const tokenName = `${this.tokenQuote}${key.toUpperCase()}${this.tokenQuote}`;
      tokens.set(tokenName, tokenValue);
    }
    return tokens;
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

function expandNestedTokens(tokens: Map<string, string>): Map<string, string> {
  for (const tokenName of [...tokens.keys()]) {
    for (const currentName of [...tokens.keys()]) {
      const currentValue = tokens.get(currentName)!;
      if (currentValue.includes(tokenName)) {
        if (tokenName === currentName) {
          throw new Error(`Token '${tokenName}' cannot contain itself`);
        }
        tokens.set(currentName, currentValue.split(tokenName).join(tokens.get(tokenName)!));
      }
    }
  }
  return tokens;
}

function expandTokensStr(s: string, tokens: Map<string, string>): string {
  for (const [key, value] of tokens) {
    if (s.includes(key)) s = s.split(key).join(value);
  }
  return s;
}

/**
 * Expand tokens in an element's text, attribute values and attribute names,
 * then recurse into children.
 */
function expandTokensForEl(element: XmlElement, tokens: Map<string, string>): void {
  if (element.text) {
    element.text = expandTokensStr(element.text, tokens);
  }
  const newAttrs = new Map<string, string>();
  for (const [key, value] of element.attrs) {
    newAttrs.set(expandTokensStr(key, tokens), expandTokensStr(value, tokens));
  }
  element.attrs = newAttrs;
  for (const child of element.children) expandTokensForEl(child, tokens);
}

function expandTokens(elements: Iterable<XmlElement>, tokens: Map<string, string>): void {
  if (tokens.size === 0) return;
  for (const element of elements) expandTokensForEl(element, tokens);
}

// ---------------------------------------------------------------------------
// Macro (<expand>) expansion
// ---------------------------------------------------------------------------

function expandMacrosList(
  elements: XmlElement[],
  macros: Map<string, XmlMacroDef>,
  tokens: Map<string, string>,
  visited: string[],
): void {
  if (macros.size === 0 && tokens.size === 0) return;
  for (const element of elements) {
    for (;;) {
      const expandEl = element.findFirstDescendant("expand");
      if (expandEl === null) break;
      expandMacro(expandEl, macros, tokens, visited);
    }
  }
}

function expandMacro(
  expandEl: XmlElement,
  macros: Map<string, XmlMacroDef>,
  tokens: Map<string, string>,
  visited: string[],
): void {
  const macroName = expandEl.attrs.get("macro");
  if (macroName === undefined) {
    throw new Error("Attempted to expand macro with no 'macro' attribute defined.");
  }
  // check for cycles in the nested macro expansion
  if (visited.includes(macroName)) {
    const expanded = visited.map((v) => `'${v}'`).join(", ");
    throw new Error(
      `Cycle in nested macros: already expanded [${expanded}] can't expand '${macroName}' again`,
    );
  }
  visited.push(macroName);

  const macroDef = macros.get(macroName);
  if (macroDef === undefined) {
    throw new Error(
      `No macro named ${macroName} found, known macros are ${[...macros.keys()].join(", ")}.`,
    );
  }
  const macroEl = macroDef.element.clone();
  expandYieldStatements(macroEl, expandEl);

  const macroTokens = macroDef.macroTokens(expandEl);
  if (macroTokens.size > 0) expandTokens(macroEl.children, macroTokens);

  // Recursively expand contained macros.
  expandMacrosList(macroEl.children, macros, tokens, visited);
  xmlReplace(expandEl, macroEl.children);
  visited.pop();
}

/**
 * Replace, in ``macroEl``, (1) named ``<yield name=X>`` tags by the children of
 * the matching ``<token name=X>`` direct child of ``expandEl`` (in definition
 * order), then (2) all remaining ``<yield>`` tags by ``expandEl``'s non-token
 * children.
 */
function expandYieldStatements(macroEl: XmlElement, expandEl: XmlElement): void {
  // replace named yields
  for (const tokenEl of expandEl.findChildren("token")) {
    const name = tokenEl.attrs.get("name");
    if (name === undefined) {
      // Mirror Python's `str(token_el.attrib)` single-quoted dict repr.
      const attrs = [...tokenEl.attrs].map(([k, v]) => `'${k}': '${v}'`).join(", ");
      throw new Error(`Found unnamed token{${attrs}}`);
    }
    const yieldEls = macroEl.findAllDescendants("yield", (y) => y.attrs.get("name") === name);
    if (yieldEls.length === 0) {
      throw new Error(`No named yield found for named token ${name}`);
    }
    for (const yieldEl of yieldEls) xmlReplace(yieldEl, tokenEl.children);
  }

  // replace unnamed yields
  const yieldEls = macroEl.findAllDescendants("yield");
  const expandChildren = expandEl.children.filter((c) => c.tag !== "token");
  for (const yieldEl of yieldEls) xmlReplace(yieldEl, expandChildren);
}

// ---------------------------------------------------------------------------
// Macro loading (embedded + imported)
// ---------------------------------------------------------------------------

function appendMacro(macros: MacrosDict, type: string, el: XmlElement): void {
  const list = macros.get(type);
  if (list) list.push(el);
  else macros.set(type, [el]);
}

function loadEmbeddedMacros(macrosElement: XmlElement, macros: MacrosDict): void {
  // attribute-typed <macro>
  for (const macro of macrosElement.findChildren("macro")) {
    if (!macro.attrs.has("type")) macro.attrs.set("type", "xml");
    appendMacro(macros, macro.attrs.get("type")!, macro);
  }
  // type shortcuts: <template>/<xml>/<token> are shorthand for <macro type=...>
  for (const tag of ["template", "xml", "token"]) {
    for (const macroEl of macrosElement.findChildren(tag)) {
      macroEl.attrs.set("type", tag);
      macroEl.tag = "macro";
      appendMacro(macros, tag, macroEl);
    }
  }
}

function importedMacroPaths(macrosElement: XmlElement): string[] {
  const paths: string[] = [];
  for (const importEl of macrosElement.findChildren("import")) {
    const raw = importEl.text;
    if (!raw) throw new Error("Empty <import> element in <macros>.");
    paths.push(raw);
  }
  return paths;
}

function loadImportedMacros(
  macrosElement: XmlElement,
  macros: MacrosDict,
  importResolver: ImportResolver,
): void {
  for (const relPath of importedMacroPaths(macrosElement)) {
    const importedRoot = importResolver(relPath);
    loadMacros(importedRoot, macros, importResolver);
  }
}

function loadMacros(
  macrosElement: XmlElement,
  macros: MacrosDict,
  importResolver: ImportResolver,
): void {
  loadImportedMacros(macrosElement, macros, importResolver);
  loadEmbeddedMacros(macrosElement, macros);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Expand macros in an XML tool tree in place and return its root — port of
 * ``xml_macros.load_with_references`` (without returning the import path list).
 */
export function expandMacros(root: XmlElement, importResolver: ImportResolver): XmlElement {
  const macrosElement = root.findChild("macros");
  if (macrosElement === null) return root;

  const macros: MacrosDict = new Map();
  loadMacros(macrosElement, macros, importResolver);
  macrosElement.clear();

  // Collect tokens.
  const tokens = new Map<string, string>();
  for (const m of macros.get("token") ?? []) {
    const tokenName = m.attrs.get("name");
    if (!tokenName) throw new Error("<token> macro is missing a name.");
    tokens.set(tokenName, m.text || "");
  }
  expandNestedTokens(tokens);

  // Expand xml macros.
  const macroDict = new Map<string, XmlMacroDef>();
  for (const m of macros.get("xml") ?? []) {
    const macroName = m.attrs.get("name");
    if (!macroName) throw new Error("<xml> macro is missing a name.");
    macroDict.set(macroName, new XmlMacroDef(m));
  }
  expandMacrosList([root], macroDict, tokens, []);

  // Reinsert template macros (used during tool execution).
  for (const m of macros.get("template") ?? []) {
    m.parent = macrosElement;
    macrosElement.children.push(m);
  }
  expandTokensForEl(root, tokens);
  return root;
}
