/**
 * Edge-annotation lookup shared between workflow visualizers (mermaid,
 * cytoscape) so they can encode map-over depth and reductions on edges.
 *
 * Keys are built using step *labels* (falling back to stepId for unlabeled
 * native steps) — that's what the format2-driven emitters key off, so the
 * lookup is direct on their side.
 */

import type {
  ConnectionValidationResult,
  StepConnectionResult,
  WorkflowConnectionResult,
} from "./types.js";

export interface EdgeAnnotation {
  sourceStep: string;
  sourceOutput: string;
  targetStep: string;
  targetInput: string;
  mapDepth: number;
  reduction: boolean;
  mapping?: string | null;
  status: ConnectionValidationResult["status"];
}

export function edgeAnnotationKey(
  sourceStep: string,
  sourceOutput: string,
  targetStep: string,
  targetInput: string,
): string {
  return `${sourceStep}|${sourceOutput}->${targetStep}|${targetInput}`;
}

function _stepKey(sr: StepConnectionResult): string {
  return sr.label ?? sr.stepId;
}

export function buildEdgeAnnotations(
  result: WorkflowConnectionResult,
): Map<string, EdgeAnnotation> {
  const stepIdToKey = new Map<string, string>();
  for (const sr of result.stepResults) {
    stepIdToKey.set(sr.stepId, _stepKey(sr));
  }

  const out = new Map<string, EdgeAnnotation>();
  for (const sr of result.stepResults) {
    const targetKey = _stepKey(sr);
    for (const cr of sr.connections) {
      const sourceKey = stepIdToKey.get(cr.sourceStep) ?? cr.sourceStep;
      const annotation: EdgeAnnotation = {
        sourceStep: sourceKey,
        sourceOutput: cr.sourceOutput,
        targetStep: targetKey,
        targetInput: cr.targetInput,
        mapDepth: cr.mapDepth ?? 0,
        reduction: cr.reduction ?? false,
        mapping: cr.mapping ?? null,
        status: cr.status,
      };
      out.set(edgeAnnotationKey(sourceKey, cr.sourceOutput, targetKey, cr.targetInput), annotation);
    }
  }
  return out;
}
