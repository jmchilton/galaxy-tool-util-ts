/**
 * Static imports of the JSON specs. Single import site so consumers
 * (program builders, browser-safe meta) share one parsed-and-typed
 * view of the spec data.
 */
import gxwf from "../../spec/gxwf.json" with { type: "json" };
import galaxyToolCache from "../../spec/galaxy-tool-cache.json" with { type: "json" };
import type { ProgramSpec } from "./spec-types.js";

export const gxwfSpec = gxwf as ProgramSpec;
export const galaxyToolCacheSpec = galaxyToolCache as ProgramSpec;
