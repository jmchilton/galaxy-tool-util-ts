/**
 * Connection validation engine. Mirrors `connection_validation.py`.
 *
 * Walks a typed workflow graph in topological order, validating each
 * connection against collection-type algebra. Produces a structured result
 * plus the resolved-output-type map (used by subworkflow recursion and
 * report building).
 */

import {
  ANY_COLLECTION_TYPE_DESCRIPTION,
  CollectionTypeDescription,
  NULL_COLLECTION_TYPE_DESCRIPTION,
  type CollectionTypeDescriptor,
} from "@galaxy-tool-util/workflow-graph";

import {
  canMatch,
  collectionTypeRank,
  compatible,
  effectiveMapOver,
  isAnyDesc,
  isListLike,
  isNullDesc,
} from "./collection-type-functions.js";
import { buildWorkflowGraph } from "./graph-builder.js";
import type { GetToolInfo } from "./get-tool-info.js";
import type {
  ConnectionRef,
  ConnectionValidationResult,
  ResolvedInput,
  ResolvedOutput,
  ResolvedStep,
  StepConnectionResult,
  StepOutputTypeMap,
  WorkflowConnectionResult,
  WorkflowGraph,
} from "./types.js";

export function validateConnections(
  workflow: unknown,
  getToolInfo: GetToolInfo,
): WorkflowConnectionResult {
  const graph = buildWorkflowGraph(workflow, getToolInfo);
  const [result] = validateConnectionGraph(graph);
  return result;
}

export function validateConnectionGraph(
  graph: WorkflowGraph,
  seedOutputTypes?: StepOutputTypeMap,
): [WorkflowConnectionResult, StepOutputTypeMap] {
  const resolvedOutputTypes: StepOutputTypeMap = {};

  for (const [stepId, step] of Object.entries(graph.steps)) {
    resolvedOutputTypes[stepId] = {};
    for (const [outputName, output] of Object.entries(step.outputs)) {
      resolvedOutputTypes[stepId][outputName] = _outputToType(output);
    }
  }

  if (seedOutputTypes) {
    for (const [stepId, outputs] of Object.entries(seedOutputTypes)) {
      if (resolvedOutputTypes[stepId]) {
        Object.assign(resolvedOutputTypes[stepId], outputs);
      }
    }
  }

  const stepResults: StepConnectionResult[] = [];

  for (const stepId of graph.sortedStepIds) {
    const step = graph.steps[stepId];
    const stepResult: StepConnectionResult = {
      stepId,
      toolId: step.toolId,
      toolVersion: step.toolVersion,
      stepType: step.stepType,
      mapOver: null,
      connections: [],
      errors: [],
    };

    if (Object.keys(step.connections).length === 0) {
      stepResults.push(stepResult);
      continue;
    }

    const mapOverContributions: Array<CollectionTypeDescriptor | null> = [];

    for (const [inputPath, refs] of Object.entries(step.connections)) {
      for (const ref of refs) {
        const connResult = _validateSingleConnection(
          ref.sourceStep,
          ref.outputName,
          stepId,
          inputPath,
          step.inputs[inputPath],
          resolvedOutputTypes,
        );
        stepResult.connections.push(connResult);

        if (connResult.status === "ok" && connResult.mapping) {
          mapOverContributions.push(new CollectionTypeDescription(connResult.mapping));
        } else if (connResult.status === "ok" || connResult.status === "skip") {
          mapOverContributions.push(null);
        }
      }
    }

    const stepMapOver = _resolveStepMapOver(mapOverContributions, stepResult);
    if (stepMapOver) {
      stepResult.mapOver = stepMapOver.collectionType;
    }

    if (step.stepType === "subworkflow" && step.innerGraph) {
      _resolveSubworkflowOutputs(step, resolvedOutputTypes);
    } else {
      _resolveOutputTypes(step, stepMapOver, resolvedOutputTypes);
    }

    stepResults.push(stepResult);
  }

  const result: WorkflowConnectionResult = {
    stepResults,
    valid: _isValid(stepResults),
    summary: _summary(stepResults),
  };
  return [result, resolvedOutputTypes];
}

function _isValid(stepResults: StepConnectionResult[]): boolean {
  for (const sr of stepResults) {
    if (sr.errors.length > 0) return false;
    for (const cr of sr.connections) {
      if (cr.status === "invalid") return false;
    }
  }
  return true;
}

function _summary(stepResults: StepConnectionResult[]): Record<string, number> {
  const counts: Record<string, number> = { ok: 0, invalid: 0, skip: 0 };
  for (const sr of stepResults) {
    for (const cr of sr.connections) {
      counts[cr.status] = (counts[cr.status] ?? 0) + 1;
    }
  }
  return counts;
}

function _validateSingleConnection(
  sourceStep: string,
  sourceOutput: string,
  targetStep: string,
  targetInput: string,
  targetResolvedInput: ResolvedInput | undefined,
  resolvedOutputTypes: StepOutputTypeMap,
): ConnectionValidationResult {
  const sourceTypes = resolvedOutputTypes[sourceStep] ?? {};
  const sourceType = sourceTypes[sourceOutput];

  if (sourceType === undefined) {
    return {
      sourceStep,
      sourceOutput,
      targetStep,
      targetInput,
      status: "skip",
      errors: [`Cannot resolve output '${sourceOutput}' on step ${sourceStep}`],
    };
  }

  if (targetResolvedInput === undefined) {
    return {
      sourceStep,
      sourceOutput,
      targetStep,
      targetInput,
      status: "skip",
      errors: [`Cannot resolve input '${targetInput}' on step ${targetStep}`],
    };
  }

  const targetType = _inputToType(targetResolvedInput);

  const ok = (mapping?: string | null): ConnectionValidationResult => ({
    sourceStep,
    sourceOutput,
    targetStep,
    targetInput,
    status: "ok",
    mapping: mapping ?? null,
    errors: [],
  });

  if (isNullDesc(sourceType)) {
    if (isNullDesc(targetType)) return ok();
    // dataset -> collection: fall through to invalid
  } else if (isAnyDesc(sourceType)) {
    return {
      sourceStep,
      sourceOutput,
      targetStep,
      targetInput,
      status: "skip",
      errors: [`Cannot determine output type for '${sourceOutput}' on step ${sourceStep}`],
    };
  } else {
    // Source is a real collection type.
    // Multi-data reduction: list-like -> data(multiple=True)
    if (targetResolvedInput.multiple && targetResolvedInput.type === "data") {
      if (sourceType instanceof CollectionTypeDescription && isListLike(sourceType)) {
        const innerList = new CollectionTypeDescription("list");
        if (sourceType.canMapOver(innerList)) {
          const remaining = sourceType.effectiveMapOver(innerList);
          return ok(remaining.collectionType);
        }
        return ok();
      }
      // Non-list-like: fall through to can_match / map_over
    }

    if (canMatch(sourceType, targetType)) return ok();

    const mapOver = effectiveMapOver(sourceType, targetType);
    if (mapOver !== null) return ok(mapOver.collectionType);
  }

  return {
    sourceStep,
    sourceOutput,
    targetStep,
    targetInput,
    status: "invalid",
    errors: [
      `Incompatible types: output is ${_typeDescription(sourceType)}, input expects ${_typeDescription(targetType)}`,
    ],
  };
}

function _resolveStepMapOver(
  contributions: Array<CollectionTypeDescriptor | null>,
  stepResult: StepConnectionResult,
): CollectionTypeDescriptor | null {
  const nonNone = contributions.filter((c): c is CollectionTypeDescriptor => c !== null);
  if (nonNone.length === 0) return null;

  let best = nonNone[0];
  for (let i = 1; i < nonNone.length; i++) {
    const ctd = nonNone[i];
    if (!compatible(best, ctd)) {
      stepResult.errors.push(
        `Incompatible map-over types: ${best.collectionType} vs ${ctd.collectionType}`,
      );
      return best;
    }
    if (collectionTypeRank(ctd) > collectionTypeRank(best)) {
      best = ctd;
    }
  }
  return best;
}

function _resolveOutputTypes(
  step: ResolvedStep,
  mapOver: CollectionTypeDescriptor | null,
  resolvedOutputTypes: StepOutputTypeMap,
): void {
  for (const [outputName, output] of Object.entries(step.outputs)) {
    if (output.type === "collection") {
      const baseType = _resolveCollectionOutputType(step, output, resolvedOutputTypes, mapOver);
      if (baseType && mapOver) {
        const combined = `${mapOver.collectionType}:${baseType}`;
        resolvedOutputTypes[step.stepId][outputName] = new CollectionTypeDescription(combined);
      } else if (baseType) {
        resolvedOutputTypes[step.stepId][outputName] = new CollectionTypeDescription(baseType);
      }
      // else: leave initialized (ANY_COLLECTION_TYPE)
    } else {
      if (mapOver) {
        resolvedOutputTypes[step.stepId][outputName] = new CollectionTypeDescription(
          mapOver.collectionType ?? "list",
        );
      } else {
        resolvedOutputTypes[step.stepId][outputName] = NULL_COLLECTION_TYPE_DESCRIPTION;
      }
    }
  }
}

function _resolveCollectionOutputType(
  step: ResolvedStep,
  output: ResolvedOutput,
  resolvedOutputTypes: StepOutputTypeMap,
  mapOver: CollectionTypeDescriptor | null,
): string | null {
  if (output.collectionType) return output.collectionType;
  const sourceParam = output.collectionTypeSource ?? output.structuredLike;
  if (sourceParam) {
    return _resolveCollectionTypeSource(step, sourceParam, resolvedOutputTypes, mapOver);
  }
  return null;
}

function _resolveCollectionTypeSource(
  step: ResolvedStep,
  sourceParam: string,
  resolvedOutputTypes: StepOutputTypeMap,
  mapOver: CollectionTypeDescriptor | null,
): string | null {
  const refs: ConnectionRef[] = step.connections[sourceParam] ?? [];
  if (refs.length === 0) return null;

  const ref = refs[0];
  const sourceTypes = resolvedOutputTypes[ref.sourceStep] ?? {};
  const sourceType = sourceTypes[ref.outputName];
  if (sourceType === undefined || isNullDesc(sourceType) || isAnyDesc(sourceType)) {
    return null;
  }
  if (!(sourceType instanceof CollectionTypeDescription)) return null;
  let ct = sourceType.collectionType ?? "";

  if (mapOver) {
    const prefix = `${mapOver.collectionType}:`;
    if (ct.startsWith(prefix)) {
      ct = ct.slice(prefix.length);
    }
  }
  return ct || null;
}

function _resolveSubworkflowOutputs(
  step: ResolvedStep,
  resolvedOutputTypes: StepOutputTypeMap,
): void {
  const innerGraph = step.innerGraph;
  if (!innerGraph) return;

  const seed: StepOutputTypeMap = {};
  for (const refs of Object.values(step.connections)) {
    for (const ref of refs) {
      const innerStepId = ref.inputSubworkflowStepId;
      if (!innerStepId) continue;
      const outerType = resolvedOutputTypes[ref.sourceStep]?.[ref.outputName];
      if (outerType !== undefined && innerStepId in innerGraph.steps) {
        if (!seed[innerStepId]) seed[innerStepId] = {};
        seed[innerStepId].output = outerType;
      }
    }
  }

  const [, innerResolved] = validateConnectionGraph(innerGraph, seed);

  if (!resolvedOutputTypes[step.stepId]) resolvedOutputTypes[step.stepId] = {};
  for (const [externalName, [innerStepId, innerOutputName]] of Object.entries(
    step.subworkflowOutputMap,
  )) {
    const innerType = innerResolved[innerStepId]?.[innerOutputName];
    if (innerType !== undefined) {
      resolvedOutputTypes[step.stepId][externalName] = innerType;
    }
  }
}

function _outputToType(output: ResolvedOutput): CollectionTypeDescriptor {
  if (output.type === "collection") {
    if (output.collectionType) {
      return new CollectionTypeDescription(output.collectionType);
    }
    return ANY_COLLECTION_TYPE_DESCRIPTION;
  }
  return NULL_COLLECTION_TYPE_DESCRIPTION;
}

function _inputToType(input: ResolvedInput): CollectionTypeDescriptor {
  if (input.type === "collection") {
    if (input.collectionType) {
      return new CollectionTypeDescription(input.collectionType);
    }
    return ANY_COLLECTION_TYPE_DESCRIPTION;
  }
  return NULL_COLLECTION_TYPE_DESCRIPTION;
}

function _typeDescription(t: CollectionTypeDescriptor): string {
  if (isNullDesc(t)) return "dataset";
  if (isAnyDesc(t)) return "collection (any type)";
  if (t instanceof CollectionTypeDescription) return `collection<${t.collectionType}>`;
  return "unknown";
}
