/**
 * Unit tests for LintContext / LintMessage / Linter primitives.
 *
 * Mirrors gxformat2/tests/test_linting.py.
 */

import { describe, it, expect } from "vitest";

import {
  LEVEL_ERROR,
  LEVEL_WARN,
  LintContext,
  Linter,
  LintMessage,
} from "../src/workflow/linting.js";

class FakeRule extends Linter {
  static severity = "warning" as const;
  static applies_to = ["native"] as const;
  static profile = "structural";
}

describe("LintMessage", () => {
  it("carries level / linter / json_pointer metadata and prose", () => {
    const msg = new LintMessage("hello", {
      level: LEVEL_ERROR,
      linter: "R",
      json_pointer: "/x",
    });
    expect(msg.message).toBe("hello");
    expect(String(msg)).toBe("hello");
    expect(`${msg}`).toBe("hello");
    expect(msg.level).toBe(LEVEL_ERROR);
    expect(msg.linter).toBe("R");
    expect(msg.json_pointer).toBe("/x");
  });
});

describe("LintContext", () => {
  it("records metadata on emitted errors", () => {
    const ctx = new LintContext();
    ctx.error("bad value", { linter: FakeRule, json_pointer: "/steps/0" });
    expect(ctx.errors).toHaveLength(1);
    const msg = ctx.errors[0];
    expect(msg.message).toBe("bad value");
    expect(msg.linter).toBe("FakeRule");
    expect(msg.json_pointer).toBe("/steps/0");
    expect(msg.level).toBe(LEVEL_ERROR);
  });

  it("child() composes an RFC 6901 json_pointer", () => {
    const ctx = new LintContext();
    const child = ctx.child("steps").child(0);
    child.warn("disconnected");
    expect(ctx.warnings[0].json_pointer).toBe("/steps/0");
    expect(ctx.warnings[0].level).toBe(LEVEL_WARN);
  });

  it("child() escapes pointer segments per RFC 6901", () => {
    const ctx = new LintContext();
    ctx.child("a/b~c").warn("x");
    expect(ctx.warnings[0].json_pointer).toBe("/a~1b~0c");
  });

  it("explicit json_pointer overrides context pointer", () => {
    const ctx = new LintContext().child("steps");
    ctx.error("oops", { json_pointer: "/elsewhere" });
    expect(ctx.errors[0].json_pointer).toBe("/elsewhere");
  });

  it("accepts a string linter name directly", () => {
    const ctx = new LintContext();
    ctx.warn("hi", { linter: "DirectName" });
    expect(ctx.warnings[0].linter).toBe("DirectName");
  });

  it("unannotated emission has empty pointer and null linter", () => {
    const ctx = new LintContext();
    ctx.warn("generic");
    const msg = ctx.warnings[0];
    expect(msg.linter).toBeNull();
    expect(msg.json_pointer).toBe("");
  });

  it("child contexts share error/warning arrays with parent", () => {
    const ctx = new LintContext();
    ctx.child("steps").child(0).error("deep");
    expect(ctx.errors).toHaveLength(1);
    expect(ctx.errors[0].json_pointer).toBe("/steps/0");
  });
});
