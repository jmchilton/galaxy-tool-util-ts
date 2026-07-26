/**
 * Tool input factory. Mirrors
 * `galaxy.tool_util.parameters.factory._from_input_source_galaxy` +
 * `input_models_for_page`: it consumes an `InputSource` (see `./input-source.ts`)
 * rather than a raw dict, so both the inline/YAML source and an XML source in
 * `@galaxy-tool-util/tool-xml` build the same `ToolParameterModel` union from
 * `bundle-types.ts`. Validator handling is best-effort: `parse_validators`
 * returns every parsed validator and the factory keeps the ones valid for the
 * parameter type (mirrors `static_validators(...)`).
 */

import type {
  ConditionalParameterModel,
  ConditionalWhen,
  RepeatParameterModel,
  SectionParameterModel,
  ToolParameterModel,
  ValidatorModel,
  InRangeValidatorModel,
  RegexValidatorModel,
  LengthValidatorModel,
  ExpressionValidatorModel,
  EmptyFieldValidatorModel,
  BooleanParameterModel,
  SelectParameterModel,
} from "../schema/bundle-types.js";

import type { InputSource, PageSource } from "./input-source.js";
import {
  DictPageSource,
  coerceBool,
  readNullableString,
  readNullableInt,
  readNullableFloat,
} from "./input-source.js";

const DATA_PARAM_TYPES = new Set([
  "integer",
  "float",
  "text",
  "boolean",
  "hidden",
  "color",
  "rules",
  "data",
  "hidden_data",
  "data_collection",
  "select",
  "drill_down",
  "data_column",
  "group_tag",
  "baseurl",
  "genomebuild",
  "directory_uri",
]);

export function parseInputs(raw: unknown): ToolParameterModel[] {
  return inputModelsForPage(new DictPageSource(raw));
}

/**
 * Mirror of `factory.input_models_for_page`: build the `ToolParameterModel`
 * list for one `PageSource`, whatever backs it (the inline/YAML `DictPageSource`
 * or an XML page source in `@galaxy-tool-util/tool-xml`).
 */
export function inputModelsForPage(page: PageSource): ToolParameterModel[] {
  return page.parseInputSources().map(fromInputSource);
}

function fromInputSource(source: InputSource): ToolParameterModel {
  const inputType = source.parseInputType();
  if (inputType === "conditional") return buildConditional(source);
  if (inputType === "repeat") return buildRepeat(source);
  if (inputType === "section") return buildSection(source);
  return buildLeafParam(source);
}

function buildConditional(source: InputSource): ConditionalParameterModel {
  const name = source.parseName();
  const testParam = fromInputSource(source.parseTestInputSource());
  if (testParam.parameter_type !== "gx_boolean" && testParam.parameter_type !== "gx_select") {
    throw new Error(
      `conditional '${name}' test_parameter must be boolean or select (got ${testParam.parameter_type})`,
    );
  }
  const whens = buildWhens(source, testParam);
  return {
    parameter_type: "gx_conditional",
    name,
    hidden: source.getBool("hidden", false),
    label: source.parseLabel(),
    help: source.parseHelp(),
    argument: readNullableString(source.get("argument")),
    is_dynamic: false,
    test_parameter: testParam as BooleanParameterModel | SelectParameterModel,
    whens,
  };
}

function buildWhens(source: InputSource, testParam: ToolParameterModel): ConditionalWhen[] {
  const defaultDiscriminator = defaultTestDiscriminator(testParam);
  const result: ConditionalWhen[] = [];
  for (const [rawDiscriminator, page] of source.parseWhenInputSources()) {
    const parameters = page.parseInputSources().map(fromInputSource);
    result.push(makeWhen(rawDiscriminator, parameters, defaultDiscriminator, testParam));
  }
  return result;
}

function defaultTestDiscriminator(testParam: ToolParameterModel): string | boolean | null {
  if (testParam.parameter_type === "gx_boolean") {
    return (testParam as BooleanParameterModel).value ?? false;
  }
  if (testParam.parameter_type === "gx_select") {
    const opts = (testParam as SelectParameterModel).options;
    if (!opts) return null;
    const selected = opts.find((o) => o.selected);
    return selected ? selected.value : (opts[0]?.value ?? null);
  }
  return null;
}

function makeWhen(
  rawDiscriminator: unknown,
  parameters: ToolParameterModel[],
  defaultDiscriminator: string | boolean | null,
  testParam: ToolParameterModel,
): ConditionalWhen {
  let typed: string | boolean;
  if (testParam.parameter_type === "gx_boolean") {
    // Mirror Python: a `<when value="X">` string matching the test param's
    // truevalue/falsevalue maps to that boolean before `string_as_bool`, so
    // e.g. truevalue="--flag" with `<when value="--flag">` selects `true`.
    const bp = testParam as BooleanParameterModel;
    if (typeof rawDiscriminator === "string" && rawDiscriminator === bp.truevalue) {
      typed = true;
    } else if (typeof rawDiscriminator === "string" && rawDiscriminator === bp.falsevalue) {
      typed = false;
    } else {
      typed = coerceBool(rawDiscriminator);
    }
  } else {
    typed = rawDiscriminator == null ? "" : String(rawDiscriminator);
  }
  const isDefault = typed === defaultDiscriminator;
  return { discriminator: typed, parameters, is_default_when: isDefault };
}

function buildRepeat(source: InputSource): RepeatParameterModel {
  const parameters = source.parseNestedInputsSource().parseInputSources().map(fromInputSource);
  return {
    parameter_type: "gx_repeat",
    name: source.parseName(),
    hidden: source.getBool("hidden", false),
    label: source.parseLabel(),
    help: source.parseHelp(),
    argument: readNullableString(source.get("argument")),
    is_dynamic: false,
    parameters,
    min: readNullableInt(source.get("min")),
    max: readNullableInt(source.get("max")),
  };
}

function buildSection(source: InputSource): SectionParameterModel {
  const parameters = source.parseNestedInputsSource().parseInputSources().map(fromInputSource);
  return {
    parameter_type: "gx_section",
    name: source.parseName(),
    hidden: source.getBool("hidden", false),
    label: source.parseLabel(),
    help: source.parseHelp(),
    argument: readNullableString(source.get("argument")),
    is_dynamic: false,
    parameters,
  };
}

function buildLeafParam(source: InputSource): ToolParameterModel {
  const paramType = readParamType(source.get("type"));
  if (!DATA_PARAM_TYPES.has(paramType)) {
    throw new Error(`Unknown Galaxy parameter type '${paramType}'`);
  }
  const base = baseFields(source);
  switch (paramType) {
    case "integer": {
      const value = parseOptionalNumber(source.get("value"), base.optional, "integer");
      return {
        ...base,
        parameter_type: "gx_integer",
        type: "integer",
        value,
        min: readNullableInt(source.get("min")),
        max: readNullableInt(source.get("max")),
        validators: filterValidators(source.parseValidators(), "number") as InRangeValidatorModel[],
      };
    }
    case "float": {
      const value = parseOptionalNumber(source.get("value"), base.optional, "float");
      return {
        ...base,
        parameter_type: "gx_float",
        type: "float",
        value,
        min: readNullableFloat(source.get("min")),
        max: readNullableFloat(source.get("max")),
        validators: filterValidators(source.parseValidators(), "number") as InRangeValidatorModel[],
      };
    }
    case "text": {
      const optional = textIsOptional(source);
      return {
        ...base,
        optional,
        parameter_type: "gx_text",
        type: "text",
        area: source.getBool("area", false),
        value: textDefault(source.get("value"), optional),
        default_options: [],
        validators: filterValidators(source.parseValidators(), "text") as (
          | RegexValidatorModel
          | LengthValidatorModel
          | ExpressionValidatorModel
          | EmptyFieldValidatorModel
        )[],
      };
    }
    case "boolean": {
      const rawChecked = source.get("checked");
      const value = rawChecked == null ? false : coerceBool(rawChecked);
      return {
        ...base,
        parameter_type: "gx_boolean",
        type: "boolean",
        value,
        truevalue: readNullableString(source.get("truevalue")),
        falsevalue: readNullableString(source.get("falsevalue")),
      };
    }
    case "hidden": {
      return {
        ...base,
        parameter_type: "gx_hidden",
        type: "hidden",
        value: readNullableString(source.get("value")),
        validators: filterValidators(source.parseValidators(), "text") as (
          | RegexValidatorModel
          | LengthValidatorModel
          | ExpressionValidatorModel
          | EmptyFieldValidatorModel
        )[],
      };
    }
    case "color": {
      const rawValue = source.get("value");
      const value = typeof rawValue === "string" ? rawValue : "#000000";
      return {
        ...base,
        parameter_type: "gx_color",
        type: "color",
        value,
      };
    }
    case "rules": {
      return { ...base, parameter_type: "gx_rules", type: "rules" };
    }
    case "data":
    case "hidden_data": {
      // hidden_data is broken without optional=true in Python; mirror the
      // override.
      const optional = paramType === "data" ? base.optional : true;
      return {
        ...base,
        optional,
        parameter_type: "gx_data",
        type: "data",
        multiple: source.getBool("multiple", false),
        extensions: source.parseExtensions(),
      };
    }
    case "data_collection": {
      return {
        ...base,
        parameter_type: "gx_data_collection",
        type: "data_collection",
        collection_type: readNullableString(source.get("collection_type")),
        extensions: source.parseExtensions(),
        value: source.parseDefault() ?? source.get("value") ?? null,
      };
    }
    case "select": {
      const multiple = source.getBool("multiple", false);
      const optional = base.optional;
      const options = source.parseStaticOptions();
      const validators = filterValidators(source.parseValidators(), "select");
      // `no_options` doesn't apply if select is optional (mirrors Python).
      const filtered = optional ? validators.filter((v) => v.type !== "no_options") : validators;
      return {
        ...base,
        parameter_type: "gx_select",
        type: "select",
        multiple,
        options,
        validators: filtered,
      };
    }
    case "drill_down": {
      return {
        ...base,
        parameter_type: "gx_drill_down",
        type: "drill_down",
        multiple: source.getBool("multiple", false),
        hierarchy: source.get("hierarchy") === "recurse" ? "recurse" : "exact",
        options: source.parseDrillDownStaticOptions() ?? [],
      };
    }
    case "data_column": {
      const multiple = source.getBool("multiple", false);
      const acceptDefault = source.getBool("accept_default", false);
      let optional = base.optional;
      let value = source.get("value") as number | string | (string | number)[] | null | undefined;
      if (!optional && acceptDefault) optional = true;
      if (acceptDefault && (value === null || value === undefined)) {
        value = multiple ? [0] : 0;
      }
      let coerced: number | number[] | null;
      if (value === null || value === undefined) {
        coerced = null;
      } else if (multiple) {
        const arr = Array.isArray(value) ? value : String(value).split(",");
        coerced = arr.map((v) => Number(v)).filter((v) => !Number.isNaN(v));
      } else {
        const n = typeof value === "number" ? value : Number(value);
        coerced = Number.isNaN(n) ? null : n;
      }
      return {
        ...base,
        optional,
        parameter_type: "gx_data_column",
        type: "data_column",
        multiple,
        value: coerced,
      };
    }
    case "group_tag": {
      return {
        ...base,
        parameter_type: "gx_group_tag",
        type: "group_tag",
        multiple: source.getBool("multiple", false),
      };
    }
    case "baseurl": {
      return {
        ...base,
        parameter_type: "gx_baseurl",
        type: "baseurl",
        value: readNullableString(source.get("value")),
      };
    }
    case "genomebuild": {
      return {
        ...base,
        parameter_type: "gx_genomebuild",
        type: "genomebuild",
        multiple: source.getBool("multiple", false),
        options: [],
      };
    }
    case "directory_uri": {
      return {
        ...base,
        parameter_type: "gx_directory_uri",
        type: "directory_uri",
        value: readNullableString(source.get("value")),
        validators: filterValidators(source.parseValidators(), "text") as ValidatorModel[],
      };
    }
    default:
      throw new Error(`Unknown Galaxy parameter type '${paramType}'`);
  }
}

function baseFields(source: InputSource): {
  name: string;
  hidden: boolean;
  label: string | null;
  help: string | null;
  argument: string | null;
  is_dynamic: boolean;
  optional: boolean;
} {
  return {
    name: source.parseName(),
    hidden: source.getBool("hidden", false),
    label: source.parseLabel(),
    help: source.parseHelp(),
    argument: readNullableString(source.get("argument")),
    is_dynamic: false,
    optional: source.parseOptional(),
  };
}

function readParamType(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function textIsOptional(source: InputSource): boolean {
  // Mirrors `text_input_is_optional`: explicit `optional:` wins, otherwise
  // inferred from `value:` being present.
  const optional = source.get("optional");
  if (optional !== undefined && optional !== null) {
    return coerceBool(optional);
  }
  const value = source.get("value");
  return value === undefined || value === null || value === "";
}

function textDefault(value: unknown, optional: boolean): string | null {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return optional ? null : "";
  return String(value);
}

function parseOptionalNumber(
  value: unknown,
  optional: boolean,
  kind: "integer" | "float",
): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const n = kind === "integer" ? parseInt(String(value), 10) : Number(value);
  if (Number.isNaN(n)) {
    if (optional) return null;
    throw new Error(`invalid ${kind} value: ${JSON.stringify(value)}`);
  }
  return n;
}

function filterValidators(
  all: ValidatorModel[],
  kind: "number" | "text" | "select",
): ValidatorModel[] {
  if (kind === "number") {
    return all.filter((v) => v.type === "in_range");
  }
  if (kind === "text") {
    return all.filter(
      (v) =>
        v.type === "length" ||
        v.type === "regex" ||
        v.type === "expression" ||
        v.type === "empty_field",
    );
  }
  // select
  return all.filter((v) => v.type === "no_options");
}
