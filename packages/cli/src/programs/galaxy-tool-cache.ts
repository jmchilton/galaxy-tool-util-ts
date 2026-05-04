/**
 * `galaxy-tool-cache` commander program — built at runtime from
 * `spec/galaxy-tool-cache.json` plus the handler registry below.
 */
import type { Command } from "commander";
import { runAdd } from "../commands/add.js";
import { runList } from "../commands/list.js";
import { runInfo } from "../commands/info.js";
import { runClear } from "../commands/clear.js";
import { runPopulateWorkflow } from "../commands/populate-workflow.js";
import { runSchema } from "../commands/schema.js";
import { runSummarize } from "../commands/summarize.js";
import { runStructuralSchema } from "../commands/structural-schema.js";
import { buildProgramFromSpec, type HandlerRegistry } from "../spec/build-program.js";
import { galaxyToolCacheSpec } from "../meta/specs.js";

const handlers: HandlerRegistry = {
  add: runAdd,
  list: runList,
  info: runInfo,
  clear: runClear,
  schema: runSchema,
  summarize: runSummarize,
  populateWorkflow: runPopulateWorkflow,
  structuralSchema: runStructuralSchema,
};

export function buildGalaxyToolCacheProgram(): Command {
  return buildProgramFromSpec(galaxyToolCacheSpec, handlers);
}
