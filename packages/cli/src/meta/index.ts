/**
 * @module @galaxy-tool-util/cli/meta
 *
 * Browser-safe CLI metadata for the `gxwf` and `galaxy-tool-cache`
 * programs. Consumers (Galaxy Workflow Foundry site, casting bundles)
 * import this subpath without dragging in commander or any node-only
 * dependency.
 *
 * Source of truth lives in `spec/*.json`. This module imports those
 * specs directly and derives the parsed `CliProgramSpec` view via the
 * commander-free walker in `spec/extract-spec.ts`. No build-time
 * codegen — the spec ships as data and is interpreted at module load.
 */
import { extractProgramFromSpec } from "./extract-spec.js";
import { gxwfSpec, galaxyToolCacheSpec } from "./specs.js";

export type {
  CliProgramSpec,
  CliCommandSpec,
  CliOptionSpec,
  CliPositionalArgSpec,
} from "./types.js";

export type { ProgramSpec, SpecCommand, SpecOption, SpecArg } from "./spec-types.js";

/** Raw spec — same shape consumers can load from `spec/*.json` directly. */
export { gxwfSpec, galaxyToolCacheSpec } from "./specs.js";

/** Parsed `CliProgramSpec` view derived from the raw spec. */
export const gxwfCliMeta = extractProgramFromSpec(gxwfSpec);
export const galaxyToolCacheCliMeta = extractProgramFromSpec(galaxyToolCacheSpec);
