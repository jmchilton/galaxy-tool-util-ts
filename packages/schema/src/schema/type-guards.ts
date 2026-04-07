/**
 * Type guard predicates for ToolParameterModel discriminated union.
 *
 * Exported from the package index so consumers (e.g. language servers)
 * don't need to duplicate these guards or reference bundle-types directly.
 */

import type {
  BooleanParameterModel,
  ConditionalParameterModel,
  DrillDownParameterModel,
  GenomeBuildParameterModel,
  RepeatParameterModel,
  SectionParameterModel,
  SelectParameterModel,
  ToolParameterModel,
} from "./bundle-types.js";

/** True for gx_select, gx_genomebuild, and gx_drill_down — params with a flat options list. */
export function isSelectLikeParam(
  p: ToolParameterModel,
): p is SelectParameterModel | GenomeBuildParameterModel | DrillDownParameterModel {
  return (
    p.parameter_type === "gx_select" ||
    p.parameter_type === "gx_genomebuild" ||
    p.parameter_type === "gx_drill_down"
  );
}

export function isBooleanParam(p: ToolParameterModel): p is BooleanParameterModel {
  return p.parameter_type === "gx_boolean";
}

export function isSectionParam(p: ToolParameterModel): p is SectionParameterModel {
  return p.parameter_type === "gx_section";
}

export function isRepeatParam(p: ToolParameterModel): p is RepeatParameterModel {
  return p.parameter_type === "gx_repeat";
}

export function isConditionalParam(p: ToolParameterModel): p is ConditionalParameterModel {
  return p.parameter_type === "gx_conditional";
}
