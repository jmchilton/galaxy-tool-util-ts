/**
 * Shared tool fixtures and cache seeding for CLI workflow tests.
 */
import { ToolCache, cacheKey, ParsedTool } from "@galaxy-tool-util/core";
import * as S from "effect/Schema";

/** Simple tool with a single text input. */
export const textOnlyTool = {
  id: "simple_tool",
  version: "1.0",
  name: "Simple Tool",
  description: null,
  inputs: [
    {
      name: "input_text",
      parameter_type: "gx_text",
      type: "text",
      hidden: false,
      label: "Input",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: false,
      area: false,
      value: "default",
      default_options: [],
      validators: [],
    },
  ],
  outputs: [],
  citations: [],
  license: null,
  profile: null,
  edam_operations: [],
  edam_topics: [],
  xrefs: [],
};

/** Simple tool with text + integer inputs. */
export const textIntegerTool = {
  id: "simple_tool",
  version: "1.0",
  name: "Simple Tool",
  description: null,
  inputs: [
    {
      name: "input_text",
      parameter_type: "gx_text",
      type: "text",
      hidden: false,
      label: "Input",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: false,
      area: false,
      value: "default",
      default_options: [],
      validators: [],
    },
    {
      name: "num_lines",
      parameter_type: "gx_integer",
      type: "integer",
      hidden: false,
      label: "Lines",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: false,
      value: 10,
      min: null,
      max: null,
      validators: [],
    },
  ],
  outputs: [],
  citations: [],
  license: null,
  profile: null,
  edam_operations: [],
  edam_topics: [],
  xrefs: [],
};

/** Tool with a data input (for connection testing). */
export const dataInputTool = {
  id: "data_tool",
  version: "1.0",
  name: "Data Tool",
  description: null,
  inputs: [
    {
      name: "input_file",
      parameter_type: "gx_data",
      type: "data",
      hidden: false,
      label: "Input",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: false,
      multiple: false,
      extensions: ["data"],
    },
    {
      name: "threshold",
      parameter_type: "gx_float",
      type: "float",
      hidden: false,
      label: "Threshold",
      help: null,
      argument: null,
      is_dynamic: false,
      optional: true,
      value: 0.5,
      min: null,
      max: null,
      validators: [],
    },
  ],
  outputs: [],
  citations: [],
  license: null,
  profile: null,
  edam_operations: [],
  edam_topics: [],
  xrefs: [],
};

export const SIMPLE_TOOL_ID = "toolshed.g2.bx.psu.edu/repos/test/simple/simple_tool";
export const DATA_TOOL_ID = "toolshed.g2.bx.psu.edu/repos/test/data/data_tool";

/** Seed cache with the text-only simple tool. */
export async function seedSimpleTool(cacheDir: string): Promise<void> {
  const cache = new ToolCache({ cacheDir });
  const key = cacheKey("https://toolshed.g2.bx.psu.edu", "test~simple~simple_tool", "1.0");
  await cache.saveTool(
    key,
    S.decodeUnknownSync(ParsedTool)(textOnlyTool),
    SIMPLE_TOOL_ID,
    "1.0",
    "api",
  );
}

/** Seed cache with text+integer simple tool and data input tool. */
export async function seedAllTools(cacheDir: string): Promise<void> {
  const cache = new ToolCache({ cacheDir });
  const simpleKey = cacheKey("https://toolshed.g2.bx.psu.edu", "test~simple~simple_tool", "1.0");
  await cache.saveTool(
    simpleKey,
    S.decodeUnknownSync(ParsedTool)(textIntegerTool),
    SIMPLE_TOOL_ID,
    "1.0",
    "api",
  );
  const dataKey = cacheKey("https://toolshed.g2.bx.psu.edu", "test~data~data_tool", "1.0");
  await cache.saveTool(
    dataKey,
    S.decodeUnknownSync(ParsedTool)(dataInputTool),
    DATA_TOOL_ID,
    "1.0",
    "api",
  );
}
