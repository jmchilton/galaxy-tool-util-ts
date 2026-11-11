import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  buildGetToolInfo,
  buildWorkflowGraph,
  isAnyDesc,
  isNullDesc,
  validateConnectionGraph,
  type WorkflowGraph,
} from "@galaxy-tool-util/connection-validation";
import { makeNodeToolCache } from "@galaxy-tool-util/core/node";
import {
  extractWorkflowInputs,
  extractWorkflowOutputs,
  normalizedNative,
  resolveFormat,
  toNative,
  type NormalizedNativeStep,
  type TestFormatDiagnostic,
  type WorkflowOutput,
  type WorkflowShape,
} from "@galaxy-tool-util/schema";
import {
  DatatypesMapperModel,
  isValidCollectionTypeStr,
  type DatatypesCombinedMap,
} from "@galaxy-tool-util/workflow-graph";
import { parseXmlToTree } from "@galaxy-tool-util/tool-xml";
import { isResolveError, resolveTool } from "./resolve-tool.js";

function fixedFormat(format: unknown): string | undefined {
  if (
    typeof format !== "string" ||
    !format ||
    isValidCollectionTypeStr(format) ||
    /^(data|input|auto|sniff|_sniff_|collection|data_collection)$/.test(format)
  ) {
    return undefined;
  }
  return format;
}

function outputFormat(
  step: NormalizedNativeStep,
  graph: WorkflowGraph,
  stepId: string,
  outputName: string,
): string | undefined {
  for (const action of Object.values(step.post_job_actions)) {
    if (action.action_type === "ChangeDatatypeAction" && action.output_name === outputName) {
      return fixedFormat(action.action_arguments?.newtype);
    }
  }

  const resolved = graph.steps[stepId];
  const source = resolved?.subworkflowOutputMap[outputName];
  if (source && resolved.innerGraph && step.subworkflow) {
    const [innerId, innerName] = source;
    const inner = step.subworkflow.steps[innerId] as NormalizedNativeStep | undefined;
    return inner && outputFormat(inner, resolved.innerGraph, innerId, innerName);
  }

  const output = resolved?.outputs[outputName];
  if (output?.type !== "data" || output.formatSource) return undefined;
  return fixedFormat(output.format);
}

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

  const native = format === "format2" ? toNative(dict) : normalizedNative(dict);
  const cache = makeNodeToolCache({ cacheDir: opts.cacheDir });
  const tools = await buildGetToolInfo(native, async (id, version) => {
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
  const graph = buildWorkflowGraph(native, {
    getToolInfo: (id, version) => {
      const tool = tools.getToolInfo(id, version);
      return version && tool?.version !== version ? undefined : tool;
    },
  });
  const [connectionResult, resolvedTypes] = validateConnectionGraph(graph);
  const metadata = new Map<string, Partial<WorkflowOutput>>();
  for (const [stepId, rawStep] of Object.entries(native.steps)) {
    const step = rawStep as NormalizedNativeStep;
    const resolved = graph.steps[stepId];
    for (const exposed of step.workflow_outputs) {
      const name = exposed.label ?? exposed.output_name;
      const port = exposed.output_name;
      const descriptor = resolvedTypes[stepId]?.[port];
      const datatype = outputFormat(step, graph, stepId, port);
      const entry: Partial<WorkflowOutput> = { format: datatype };
      // When map-over is ambiguous, leave the output's shape unknown.
      if (connectionResult.valid && descriptor && !isAnyDesc(descriptor)) {
        if (!isNullDesc(descriptor) && descriptor.collectionType) {
          entry.kind = "collection";
          entry.collectionType = descriptor.collectionType;
        } else if (
          isNullDesc(descriptor) &&
          (resolved.outputs[port]?.type === "data" || datatype)
        ) {
          entry.kind = "dataset";
        }
      } else if (resolved.outputs[port]?.type === "collection") {
        entry.kind = "collection";
      }
      if (metadata.has(name)) {
        metadata.set(name, {});
      } else {
        metadata.set(name, entry);
      }
    }
  }
  return {
    inputs,
    outputs: outputs.map((output) => ({ ...output, ...metadata.get(output.name) })),
    inputMetadataOptions,
  };
}
