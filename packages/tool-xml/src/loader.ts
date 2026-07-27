import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parseXmlToTree } from "./element.js";
import type { XmlElement } from "./element.js";
import { expandMacros, type ImportResolver } from "./macros.js";

/**
 * Load a tool XML file from disk and expand its macros — the filesystem-backed
 * equivalent of ``xml_macros.load(path)``. ``<import>`` paths resolve relative
 * to the tool file's directory (matching Galaxy's ``xml_base_dir``).
 */
export function loadTool(path: string): XmlElement {
  const baseDir = dirname(path);
  const importResolver: ImportResolver = (relPath) =>
    parseXmlToTree(readFileSync(join(baseDir, relPath), "utf-8"));
  return expandMacros(parseXmlToTree(readFileSync(path, "utf-8")), importResolver);
}
