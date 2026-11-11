import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  buildGetToolInfo,
  resolveWorkflowOutputs,
  type GetToolInfo,
  type ResolvedWorkflowOutput,
} from "@galaxy-tool-util/connection-validation";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import {
  extractWorkflowInputs,
  extractWorkflowOutputs,
  resolveFormat,
  type TestFormatDiagnostic,
  type WorkflowShape,
} from "@galaxy-tool-util/schema";
import { DatatypesMapperModel, type DatatypesCombinedMap } from "@galaxy-tool-util/workflow-graph";
import { parseXmlToTree } from "@galaxy-tool-util/tool-xml";
import { isResolveError, resolveTool } from "./resolve-tool.js";

/** Split diagnostics into errors (severity absent or `error`) and warnings. */
export function partitionDiagnostics(diagnostics: TestFormatDiagnostic[]): {
  errors: TestFormatDiagnostic[];
  warnings: TestFormatDiagnostic[];
} {
  return {
    errors: diagnostics.filter((d) => d.severity !== "warning"),
    warnings: diagnostics.filter((d) => d.severity === "warning"),
  };
}

export interface WorkflowTestMetadataOptions {
  cacheDir?: string;
  datatypes?: string;
}

async function loadDatatypeRegistry(path: string): Promise<DatatypesMapperModel> {
  const registry = JSON.parse(
    await readFile(path, "utf-8"),
  ) as Partial<DatatypesCombinedMap> | null;
  if (
    !Array.isArray(registry?.datatypes) ||
    !registry.datatypes.every((type) => typeof type === "string") ||
    !registry.datatypes_mapping?.ext_to_class_name ||
    !registry.datatypes_mapping.class_to_classes
  ) {
    throw new Error(`Invalid Galaxy datatype registry: ${path}`);
  }
  return new DatatypesMapperModel(registry as DatatypesCombinedMap);
}

export async function loadWorkflowTestShape(
  path: string,
  opts: WorkflowTestMetadataOptions = {},
): Promise<WorkflowShape> {
  const raw = await readFile(path, "utf-8");
  const parsed: unknown =
    path.endsWith(".ga") || path.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Workflow ${path} did not parse to an object.`);
  }
  const dict = parsed as Record<string, unknown>;
  const format = resolveFormat(dict);
  const inputs = extractWorkflowInputs(dict, format);
  const outputs = extractWorkflowOutputs(dict, format);
  const registry = opts.datatypes ? await loadDatatypeRegistry(opts.datatypes) : undefined;
  const inputMetadataOptions: WorkflowShape["inputMetadataOptions"] = {
    inputFormatAccepts: registry
      ? (expected, actual) => {
          const mapping = registry.datatypesMapping;
          const actualClass = mapping.ext_to_class_name[actual];
          if (!actualClass || !Object.hasOwn(mapping.class_to_classes, actualClass))
            return undefined;
          if (registry.isSubTypeOfAny(actual, [...expected])) return true;
          if (
            expected.every(
              (type) =>
                Object.hasOwn(mapping.ext_to_class_name, type) ||
                Object.hasOwn(mapping.class_to_classes, type),
            )
          )
            return false;
          return undefined;
        }
      : undefined,
  };
  if (!outputs.length) return { inputs, outputs, inputMetadataOptions };
  const resolved = await resolveOutputs(dict, opts);
  return {
    inputs,
    outputs: outputs.map((output) => ({ ...output, ...resolved.get(output.name) })),
    inputMetadataOptions,
  };
}

/**
 * Output shapes and fixed formats from the connection graph, reading tools
 * from the local cache only. A graph that can't be built leaves every output
 * unresolved; the label checks still run.
 */
async function resolveOutputs(
  workflow: Record<string, unknown>,
  opts: WorkflowTestMetadataOptions,
): Promise<Map<string, ResolvedWorkflowOutput>> {
  try {
    return resolveWorkflowOutputs(workflow, await cachedToolInfo(workflow, opts.cacheDir));
  } catch {
    return new Map();
  }
}

async function cachedToolInfo(
  workflow: Record<string, unknown>,
  cacheDir: string | undefined,
): Promise<GetToolInfo> {
  const cache = makeNodeToolCache({ cacheDir });
  const tools = await buildGetToolInfo(workflow, async (id, version) => {
    const resolved = await resolveTool(cache, id, version);
    if (isResolveError(resolved)) return null;
    const { tool, key } = resolved;
    const source = await cache.loadToolSource(key);
    // The cached tool keeps an output's format from before the XML's conditional rules apply.
    const outputDefinitions =
      source?.language === "xml" && source.macrosExpanded
        ? parseXmlToTree(source.contents).findChild("outputs")?.findChildren("data")
        : undefined;
    const fixedOutputs = new Set(
      outputDefinitions
        ?.filter((output) => !output.findChild("change_format") && !output.findChild("actions"))
        .map((output) => output.attrs.get("name")),
    );
    return {
      ...tool,
      outputs: tool.outputs.map((output) =>
        output.type === "data" && !fixedOutputs.has(output.name)
          ? { ...output, format: "input" }
          : output,
      ),
    };
  });
  return {
    getToolInfo: (id, version) => {
      const tool = tools.getToolInfo(id, version);
      return version && tool?.version !== version ? undefined : tool;
    },
  };
}
