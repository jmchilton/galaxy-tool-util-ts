/** `--version` reports the installed package version (#201). */
import { describe, it, expect } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { buildGxwfProgram } from "../src/programs/gxwf.js";
import { buildGalaxyToolCacheProgram } from "../src/programs/galaxy-tool-cache.js";
import { gxwfCliMeta, galaxyToolCacheCliMeta } from "../src/meta/index.js";

describe("program version", () => {
  it("gxwf reports the package version", () => {
    expect(buildGxwfProgram().version()).toBe(pkg.version);
    expect(gxwfCliMeta.version).toBe(pkg.version);
  });

  it("galaxy-tool-cache reports the package version", () => {
    expect(buildGalaxyToolCacheProgram().version()).toBe(pkg.version);
    expect(galaxyToolCacheCliMeta.version).toBe(pkg.version);
  });
});
