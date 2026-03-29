/**
 * TypeScript types for the serialized ToolParameterBundleModel JSON
 * produced by Python's model_dump(). These are trusted input — no runtime
 * validation, just type definitions for the shape of the data.
 */

// Base fields shared by all Galaxy parameter models
export interface BaseGalaxyParameterModel {
  name: string;
  parameter_type: string;
  type: string;
  hidden: boolean;
  label: string | null;
  help: string | null;
  argument: string | null;
  is_dynamic: boolean;
  optional: boolean;
}

// Validator model types (serialized forms)
export interface InRangeValidatorModel {
  type: "in_range";
  min?: number | null;
  max?: number | null;
  exclude_min: boolean;
  exclude_max: boolean;
  negate: boolean;
  implicit?: boolean;
  message?: string | null;
}

export interface RegexValidatorModel {
  type: "regex";
  expression: string;
  negate: boolean;
}

export interface LengthValidatorModel {
  type: "length";
  min?: number | null;
  max?: number | null;
  negate: boolean;
}

export interface ExpressionValidatorModel {
  type: "expression";
  expression: string;
  negate: boolean;
}

export interface EmptyFieldValidatorModel {
  type: "empty_field";
  negate: boolean;
}

export interface NoOptionsValidatorModel {
  type: "no_options";
  negate: boolean;
}

export type ValidatorModel =
  | InRangeValidatorModel
  | RegexValidatorModel
  | LengthValidatorModel
  | ExpressionValidatorModel
  | EmptyFieldValidatorModel
  | NoOptionsValidatorModel;

// Specific parameter model types

export interface IntegerParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_integer";
  type: "integer";
  value: number | null;
  min: number | null;
  max: number | null;
  validators: InRangeValidatorModel[];
}

export interface FloatParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_float";
  type: "float";
  value: number | null;
  min: number | null;
  max: number | null;
  validators: InRangeValidatorModel[];
}

export interface TextParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_text";
  type: "text";
  area: boolean;
  value: string | null;
  default_options: LabelValue[];
  validators: (
    | RegexValidatorModel
    | LengthValidatorModel
    | ExpressionValidatorModel
    | EmptyFieldValidatorModel
  )[];
}

export interface BooleanParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_boolean";
  type: "boolean";
  value: boolean;
  truevalue: string | null;
  falsevalue: string | null;
}

export interface LabelValue {
  label: string;
  value: string;
  selected: boolean;
}

export interface SelectParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_select";
  type: "select";
  multiple: boolean;
  options: LabelValue[];
  validators: ValidatorModel[];
}

export interface ColorParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_color";
  type: "color";
  value: string;
}

export interface HiddenParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_hidden";
  type: "hidden";
  value: string | null;
  validators: (
    | RegexValidatorModel
    | LengthValidatorModel
    | ExpressionValidatorModel
    | EmptyFieldValidatorModel
  )[];
}

export interface DirectoryUriParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_directory_uri";
  type: "directory_uri";
  value: string | null;
  validators: ValidatorModel[];
}

export interface GenomeBuildParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_genomebuild";
  type: "genomebuild";
  multiple: boolean;
  options: LabelValue[];
}

export interface BaseUrlParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_baseurl";
  type: "baseurl";
  value: string | null;
}

export interface DrillDownParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_drill_down";
  type: "drill_down";
  multiple: boolean;
  options: DrillDownOption[];
}

export interface DrillDownOption {
  value: string;
  name: string;
  options: DrillDownOption[];
  selected: boolean;
}

export interface DataColumnParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_data_column";
  type: "data_column";
  multiple: boolean;
}

export interface GroupTagParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_group_tag";
  type: "group_tag";
  multiple: boolean;
}

export interface DataParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_data";
  type: "data";
  multiple: boolean;
  extensions: string[];
}

export interface DataCollectionParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_data_collection";
  type: "data_collection";
  collection_type: string | null;
}

export interface RulesParameterModel extends BaseGalaxyParameterModel {
  parameter_type: "gx_rules";
  type: "rules";
}

// Container types

export interface ConditionalWhen {
  discriminator: string | boolean;
  parameters: ToolParameterModel[];
  is_default_when: boolean;
}

// Container types share some base fields but not all (no `type`, `optional` varies)
interface ContainerBaseFields {
  name: string;
  hidden: boolean;
  label: string | null;
  help: string | null;
  argument: string | null;
  is_dynamic: boolean;
}

export interface ConditionalParameterModel extends ContainerBaseFields {
  parameter_type: "gx_conditional";
  test_parameter: BooleanParameterModel | SelectParameterModel;
  whens: ConditionalWhen[];
}

export interface RepeatParameterModel extends ContainerBaseFields {
  parameter_type: "gx_repeat";
  parameters: ToolParameterModel[];
  min: number | null;
  max: number | null;
}

export interface SectionParameterModel extends ContainerBaseFields {
  parameter_type: "gx_section";
  parameters: ToolParameterModel[];
}

// CWL parameter types

export interface CwlIntegerParameterModel {
  parameter_type: "cwl_integer";
  name: string;
  optional: boolean;
}

export interface CwlFloatParameterModel {
  parameter_type: "cwl_float";
  name: string;
  optional: boolean;
}

export interface CwlStringParameterModel {
  parameter_type: "cwl_string";
  name: string;
  optional: boolean;
}

export interface CwlBooleanParameterModel {
  parameter_type: "cwl_boolean";
  name: string;
  optional: boolean;
}

export interface CwlFileParameterModel {
  parameter_type: "cwl_file";
  name: string;
  optional: boolean;
}

export interface CwlDirectoryParameterModel {
  parameter_type: "cwl_directory";
  name: string;
  optional: boolean;
}

export interface CwlNullParameterModel {
  parameter_type: "cwl_null";
  name: string;
}

export interface CwlUnionParameterModel {
  parameter_type: "cwl_union";
  name: string;
  parameters: ToolParameterModel[];
}

// Union of all parameter types (discriminated on parameter_type)
export type GalaxyParameterModel =
  | IntegerParameterModel
  | FloatParameterModel
  | TextParameterModel
  | BooleanParameterModel
  | SelectParameterModel
  | ColorParameterModel
  | HiddenParameterModel
  | DirectoryUriParameterModel
  | GenomeBuildParameterModel
  | BaseUrlParameterModel
  | DrillDownParameterModel
  | DataColumnParameterModel
  | GroupTagParameterModel
  | DataParameterModel
  | DataCollectionParameterModel
  | RulesParameterModel;

export type ContainerParameterModel =
  | ConditionalParameterModel
  | RepeatParameterModel
  | SectionParameterModel;

export type CwlParameterModel =
  | CwlIntegerParameterModel
  | CwlFloatParameterModel
  | CwlStringParameterModel
  | CwlBooleanParameterModel
  | CwlFileParameterModel
  | CwlDirectoryParameterModel
  | CwlNullParameterModel
  | CwlUnionParameterModel;

export type ToolParameterModel = GalaxyParameterModel | ContainerParameterModel | CwlParameterModel;

// The top-level bundle
export interface ToolParameterBundleModel {
  parameters: ToolParameterModel[];
}

/**
 * Extract all parameter_type values from a bundle (including nested).
 * Used by test harness skip logic.
 */
export function collectParameterTypes(bundle: ToolParameterBundleModel): Set<string> {
  const types = new Set<string>();
  function walk(params: ToolParameterModel[]) {
    for (const p of params) {
      types.add(p.parameter_type);
      if (p.parameter_type === "gx_conditional") {
        const cond = p as ConditionalParameterModel;
        types.add(cond.test_parameter.parameter_type);
        for (const when of cond.whens) {
          walk(when.parameters);
        }
      } else if (p.parameter_type === "gx_repeat" || p.parameter_type === "gx_section") {
        walk((p as RepeatParameterModel | SectionParameterModel).parameters);
      } else if (p.parameter_type === "cwl_union") {
        walk((p as CwlUnionParameterModel).parameters);
      }
    }
  }
  walk(bundle.parameters);
  return types;
}

/**
 * Extract all validator type values from a bundle (including nested).
 * Used by test harness skip logic.
 */
export function collectValidatorTypes(bundle: ToolParameterBundleModel): Set<string> {
  const types = new Set<string>();
  function walk(params: ToolParameterModel[]) {
    for (const p of params) {
      if ("validators" in p && Array.isArray(p.validators)) {
        for (const v of p.validators as ValidatorModel[]) {
          types.add(v.type);
        }
      }
      // Also check min/max on integer/float — these imply in_range
      if (p.parameter_type === "gx_integer" || p.parameter_type === "gx_float") {
        const num = p as IntegerParameterModel | FloatParameterModel;
        if (num.min !== null || num.max !== null) {
          types.add("in_range");
        }
      }
      if (p.parameter_type === "gx_conditional") {
        const cond = p as ConditionalParameterModel;
        // Check test_parameter for validators too
        const tp = cond.test_parameter;
        if ("validators" in tp && Array.isArray(tp.validators)) {
          for (const v of tp.validators as ValidatorModel[]) {
            types.add(v.type);
          }
        }
        for (const when of cond.whens) {
          walk(when.parameters);
        }
      } else if (p.parameter_type === "gx_repeat" || p.parameter_type === "gx_section") {
        walk((p as RepeatParameterModel | SectionParameterModel).parameters);
      }
    }
  }
  walk(bundle.parameters);
  return types;
}
