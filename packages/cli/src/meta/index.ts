/**
 * @module @galaxy-tool-util/cli/meta
 *
 * Browser-safe CLI metadata for the `gxwf` and `galaxy-tool-cache`
 * programs. Consumers (Galaxy Workflow Foundry site, casting bundles)
 * import this subpath without dragging in commander or any node-only
 * dependency.
 *
 * The data is generated from the same commander programs that define
 * the binaries, so it cannot drift. See `scripts/generate-cli-meta.mjs`.
 */
export type {
  CliProgramSpec,
  CliCommandSpec,
  CliOptionSpec,
  CliPositionalArgSpec,
} from "./types.js";

export { gxwfCliMeta, galaxyToolCacheCliMeta } from "./_generated.js";
