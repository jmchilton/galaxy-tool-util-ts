import { describe, expect, it } from "vitest";

import { serializeWorkflow } from "../src/workflow/serialize.js";

describe("serializeWorkflow format2 YAML", () => {
  it("quotes YAML 1.1 word-form booleans so 1.1 readers keep them as strings", () => {
    const out = serializeWorkflow(
      { steps: { s: { tool_state: { guide: { use_guide: "no", also: "yes", flag: "on" } } } } },
      "format2",
    );
    expect(out).toContain('use_guide: "no"');
    expect(out).toContain('also: "yes"');
    expect(out).toContain('flag: "on"');
  });

  it("leaves real booleans and numbers unquoted", () => {
    const out = serializeWorkflow({ enabled: true, count: 5, ratio: 1.5 }, "format2");
    expect(out).toContain("enabled: true");
    expect(out).toContain("count: 5");
    expect(out).toContain("ratio: 1.5");
  });

  it("quotes numeric-looking strings", () => {
    const out = serializeWorkflow({ fraction: "0.01" }, "format2");
    expect(out).toContain('fraction: "0.01"');
  });

  it("leaves ordinary strings unquoted", () => {
    const out = serializeWorkflow({ label: "hello" }, "format2");
    expect(out).toContain("label: hello");
  });
});
