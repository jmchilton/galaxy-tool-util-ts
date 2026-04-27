/**
 * `gxwf cytoscapejs` — render a Galaxy workflow as Cytoscape.js elements,
 * either as JSON (default / `.json` output) or as a standalone HTML viewer
 * (`.html` output).
 *
 * Port of gxformat2's `gxwf-viz` CLI; diverges from Python by defaulting to
 * stdout JSON when no output path is given.
 */
import { cytoscapeElements, elementsToList } from "@galaxy-tool-util/schema";
import type { CytoscapeElements } from "@galaxy-tool-util/schema";
import { writeFile } from "node:fs/promises";

import { CYTOSCAPE_HTML_TEMPLATE } from "./cytoscapejs/_template-bundled.js";
import { readWorkflowFile } from "./workflow-io.js";

export interface CytoscapeJsCommandOptions {
  output?: string;
  html?: boolean;
  json?: boolean;
}

export function renderHtml(elements: CytoscapeElements): string {
  const json = JSON.stringify(elementsToList(elements));
  // Python uses string.Template.safe_substitute(elements=...). The only
  // $-prefixed token in the template is $elements.
  return CYTOSCAPE_HTML_TEMPLATE.replaceAll("$elements", json);
}

function chooseFormat(opts: CytoscapeJsCommandOptions): "json" | "html" {
  if (opts.html) return "html";
  if (opts.json) return "json";
  if (opts.output?.endsWith(".html")) return "html";
  return "json";
}

export async function runCytoscapeJs(
  filePath: string,
  opts: CytoscapeJsCommandOptions,
): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;

  const elements = cytoscapeElements(data);
  const format = chooseFormat(opts);

  const content =
    format === "html" ? renderHtml(elements) : JSON.stringify(elementsToList(elements), null, 2);

  if (!opts.output) {
    process.stdout.write(content + "\n");
    return;
  }
  await writeFile(opts.output, content + "\n", "utf-8");
  console.error(`Cytoscape ${format.toUpperCase()} written to ${opts.output}`);
}
