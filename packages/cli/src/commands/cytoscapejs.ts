/**
 * `gxwf cytoscapejs` — render a Galaxy workflow as Cytoscape.js elements,
 * either as JSON (default / `.json` output) or as a standalone HTML viewer
 * (`.html` output).
 *
 * Port of gxformat2's `gxwf-viz` CLI; diverges from Python by defaulting to
 * stdout JSON when no output path is given.
 */
import { cytoscapeElements, elementsToList, isLayoutName } from "@galaxy-tool-util/schema";
import type { CytoscapeElements, LayoutName } from "@galaxy-tool-util/schema";
import { writeFile } from "node:fs/promises";

import { resolveEdgeAnnotations } from "./annotate-connections.js";
import { CYTOSCAPE_HTML_TEMPLATE } from "./cytoscapejs/_template-bundled.js";
import { readWorkflowFile } from "./workflow-io.js";

export interface CytoscapeJsCommandOptions {
  output?: string;
  html?: boolean;
  json?: boolean;
  annotateConnections?: boolean;
  cacheDir?: string;
  layout?: string;
}

export function renderHtml(elements: CytoscapeElements, layout: LayoutName = "preset"): string {
  const elementsJson = JSON.stringify(elementsToList(elements));
  // Python uses string.Template.safe_substitute(...). Tokens are $elements
  // and $layout (a quoted string the template embeds inside `layout: { name: ... }`).
  return CYTOSCAPE_HTML_TEMPLATE.replaceAll("$elements", elementsJson).replaceAll(
    "$layout",
    JSON.stringify(layout),
  );
}

function chooseFormat(opts: CytoscapeJsCommandOptions): "json" | "html" {
  if (opts.html) return "html";
  if (opts.json) return "json";
  if (opts.output?.endsWith(".html")) return "html";
  return "json";
}

function resolveLayout(raw: string | undefined): LayoutName {
  if (raw == null) return "preset";
  if (!isLayoutName(raw)) {
    throw new Error(
      `Unknown --layout "${raw}". Valid values: preset, topological, dagre, breadthfirst, grid, cose, random.`,
    );
  }
  return raw;
}

export async function runCytoscapeJs(
  filePath: string,
  opts: CytoscapeJsCommandOptions,
): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;

  const layout = resolveLayout(opts.layout);

  const edgeAnnotations = opts.annotateConnections
    ? await resolveEdgeAnnotations(data, { cacheDir: opts.cacheDir })
    : undefined;

  const elements = cytoscapeElements(data, { edgeAnnotations, layout });
  const format = chooseFormat(opts);

  // JSON shape: bare list when layout=preset (Python parity), wrapped
  // {elements, layout} when caller opted in to a non-default layout. The
  // wrapper carries the hint so downstream consumers (e.g. gxwf-ui) can honor
  // it without sniffing.
  const jsonPayload =
    layout === "preset"
      ? elementsToList(elements)
      : { elements: elementsToList(elements), layout: { name: layout } };

  const content =
    format === "html" ? renderHtml(elements, layout) : JSON.stringify(jsonPayload, null, 2);

  if (!opts.output) {
    process.stdout.write(content + "\n");
    return;
  }
  await writeFile(opts.output, content + "\n", "utf-8");
  console.error(`Cytoscape ${format.toUpperCase()} written to ${opts.output}`);
}
