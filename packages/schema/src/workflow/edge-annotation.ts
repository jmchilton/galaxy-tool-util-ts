/**
 * Edge-annotation contract consumed by workflow visualizers (mermaid,
 * cytoscape) when encoding map-over depth and reductions on edges.
 *
 * This is a structural duplicate of the type re-exported from
 * `@galaxy-tool-util/connection-validation`. Schema cannot import the
 * validator (dep chain points the other way), so it defines the contract
 * locally; pass-through is via structural typing.
 *
 * Lookup keys use step *labels* (falling back to native stepId when a
 * label is absent), matching what format2-driven emitters key off.
 */

export interface EdgeAnnotation {
  sourceStep: string;
  sourceOutput: string;
  targetStep: string;
  targetInput: string;
  mapDepth: number;
  reduction: boolean;
  mapping?: string | null;
  status?: "ok" | "invalid" | "skip";
}

export function edgeAnnotationKey(
  sourceStep: string,
  sourceOutput: string,
  targetStep: string,
  targetInput: string,
): string {
  return `${sourceStep}|${sourceOutput}->${targetStep}|${targetInput}`;
}
