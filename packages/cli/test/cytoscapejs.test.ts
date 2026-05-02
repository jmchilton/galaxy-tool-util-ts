import { describe, it, expect } from "vitest";

import { cytoscapeElements } from "@galaxy-tool-util/schema";
import { renderHtml } from "../src/commands/cytoscapejs.js";

describe("renderHtml", () => {
  const wf = {
    class: "GalaxyWorkflow",
    inputs: { the_input: "data" },
    steps: {
      cat: { tool_id: "cat1", in: { input1: "the_input" }, out: [{ id: "out_file1" }] },
    },
  };

  it("substitutes elements into the bundled cytoscape template", () => {
    const html = renderHtml(cytoscapeElements(wf));
    expect(html).toContain("</body>");
    expect(html).toContain("cytoscape");
    // Elements payload was substituted (no $elements placeholder remains).
    expect(html).not.toContain("$elements");
    // The substituted JSON contains our node id.
    expect(html).toContain('"id":"the_input"');
    // Default layout substitution.
    expect(html).not.toContain("$layout");
    expect(html).toContain('var requestedLayout = "preset"');
  });

  it("threads non-default layout name into the template", () => {
    const html = renderHtml(cytoscapeElements(wf, { layout: "dagre" }), "dagre");
    expect(html).toContain('var requestedLayout = "dagre"');
    expect(html).not.toContain("$layout");
  });
});
