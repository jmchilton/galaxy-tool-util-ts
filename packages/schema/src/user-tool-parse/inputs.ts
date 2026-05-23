/**
 * Inline tool input parser. Mirrors
 * `galaxy.tool_util.parameters.factory._from_input_source_galaxy`, normalized
 * to the YAML pathway only (no XML). Produces the Galaxy `ToolParameterModel`
 * union from `bundle-types.ts`. Validator handling is best-effort: we read
 * `validators: [{type, ...}]` entries verbatim, mirroring
 * `static_validators(parse_dict_validators(...))` once you've stripped the XML
 * shorthand handling and the `in_range` synthesis from `min`/`max` (which is
 * what Python does too).
 */

import type {
  ConditionalParameterModel,
  ConditionalWhen,
  RepeatParameterModel,
  SectionParameterModel,
  ToolParameterModel,
  LabelValue,
  DrillDownOption,
  ValidatorModel,
  InRangeValidatorModel,
  RegexValidatorModel,
  LengthValidatorModel,
  ExpressionValidatorModel,
  EmptyFieldValidatorModel,
  BooleanParameterModel,
  SelectParameterModel,
} from "../schema/bundle-types.js";

type Dict = Record<string, unknown>;

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
  const list = normalizeInputList(raw);
  return list.map(parseInput);
}

function normalizeInputList(raw: unknown): Dict[] {
  if (Array.isArray(raw)) {
    return raw.filter(isDict);
  }
  if (raw && typeof raw === "object") {
    const out: Dict[] = [];
    for (const [k, v] of Object.entries(raw as Dict)) {
      if (isDict(v)) {
        const merged = { ...(v as Dict) };
        if (merged.name == null) merged.name = k;
        out.push(merged);
      }
    }
    return out;
  }
  return [];
}

function parseInput(input: Dict): ToolParameterModel {
  const containerType = readContainerType(input);
  if (containerType === "conditional") return parseConditional(input);
  if (containerType === "repeat") return parseRepeat(input);
  if (containerType === "section") return parseSection(input);
  return parseLeafParam(input);
}

function readContainerType(input: Dict): "conditional" | "repeat" | "section" | null {
  const t = input.type;
  if (t === "conditional") return "conditional";
  if (t === "repeat") return "repeat";
  if (t === "section") return "section";
  return null;
}

function parseConditional(input: Dict): ConditionalParameterModel {
  const name = readString(input.name);
  const testRaw = input.test_parameter;
  if (!isDict(testRaw)) {
    throw new Error(`conditional '${name}' must define a 'test_parameter'`);
  }
  const testParam = parseLeafParam(testRaw);
  if (testParam.parameter_type !== "gx_boolean" && testParam.parameter_type !== "gx_select") {
    throw new Error(
      `conditional '${name}' test_parameter must be boolean or select (got ${testParam.parameter_type})`,
    );
  }
  const whens = parseWhens(input, testParam);
  return {
    parameter_type: "gx_conditional",
    name,
    hidden: readBool(input.hidden, false),
    label: readNullableString(input.label),
    help: readNullableString(input.help),
    argument: readNullableString(input.argument),
    is_dynamic: false,
    test_parameter: testParam as BooleanParameterModel | SelectParameterModel,
    whens,
  };
}

function parseWhens(input: Dict, testParam: ToolParameterModel): ConditionalWhen[] {
  const defaultDiscriminator = defaultTestDiscriminator(testParam);
  const result: ConditionalWhen[] = [];

  // YAML supports two shapes: `when: {key: [params], ...}` (map) and `whens:
  // [{discriminator, parameters: [...]}]` (list).
  const whenMap = input.when;
  const whenList = input.whens;
  if (isDict(whenMap)) {
    for (const [key, value] of Object.entries(whenMap as Dict)) {
      const params = Array.isArray(value) ? value.filter(isDict) : [];
      result.push(makeWhen(key, parseInputs(params), defaultDiscriminator, testParam));
    }
  } else if (Array.isArray(whenList)) {
    for (const item of whenList) {
      if (!isDict(item)) continue;
      const disc = (item as Dict).discriminator;
      const params = (item as Dict).parameters;
      result.push(makeWhen(disc, parseInputs(params), defaultDiscriminator, testParam));
    }
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
    typed = coerceBool(rawDiscriminator);
  } else {
    typed = rawDiscriminator == null ? "" : String(rawDiscriminator);
  }
  const isDefault = typed === defaultDiscriminator;
  return { discriminator: typed, parameters, is_default_when: isDefault };
}

function coerceBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return true;
    return false;
  }
  return Boolean(v);
}

function parseRepeat(input: Dict): RepeatParameterModel {
  const name = readString(input.name);
  const innerRaw = input.blocks ?? input.parameters ?? input.inputs;
  const parameters = parseInputs(innerRaw);
  return {
    parameter_type: "gx_repeat",
    name,
    hidden: readBool(input.hidden, false),
    label: readNullableString(input.label),
    help: readNullableString(input.help),
    argument: readNullableString(input.argument),
    is_dynamic: false,
    parameters,
    min: readNullableInt(input.min),
    max: readNullableInt(input.max),
  };
}

function parseSection(input: Dict): SectionParameterModel {
  const name = readString(input.name);
  const innerRaw = input.parameters ?? input.inputs;
  const parameters = parseInputs(innerRaw);
  return {
    parameter_type: "gx_section",
    name,
    hidden: readBool(input.hidden, false),
    label: readNullableString(input.label),
    help: readNullableString(input.help),
    argument: readNullableString(input.argument),
    is_dynamic: false,
    parameters,
  };
}

function parseLeafParam(input: Dict): ToolParameterModel {
  const paramType = readString(input.type);
  if (!DATA_PARAM_TYPES.has(paramType)) {
    throw new Error(`Unknown Galaxy parameter type '${paramType}'`);
  }
  const base = baseFields(input);
  switch (paramType) {
    case "integer": {
      const optional = base.optional;
      const value = parseOptionalNumber(input.value, optional, "integer");
      return {
        ...base,
        parameter_type: "gx_integer",
        type: "integer",
        value,
        min: readNullableInt(input.min),
        max: readNullableInt(input.max),
        validators: collectValidators(input.validators, "number") as InRangeValidatorModel[],
      };
    }
    case "float": {
      const optional = base.optional;
      const value = parseOptionalNumber(input.value, optional, "float");
      return {
        ...base,
        parameter_type: "gx_float",
        type: "float",
        value,
        min: readNullableFloat(input.min),
        max: readNullableFloat(input.max),
        validators: collectValidators(input.validators, "number") as InRangeValidatorModel[],
      };
    }
    case "text": {
      const optional = textIsOptional(input);
      return {
        ...base,
        optional,
        parameter_type: "gx_text",
        type: "text",
        area: readBool(input.area, false),
        value: textDefault(input.value, optional),
        default_options: [],
        validators: collectValidators(input.validators, "text") as (
          | RegexValidatorModel
          | LengthValidatorModel
          | ExpressionValidatorModel
          | EmptyFieldValidatorModel
        )[],
      };
    }
    case "boolean": {
      const optional = base.optional;
      const rawChecked = input.checked;
      const value = rawChecked == null ? (optional ? false : false) : coerceBool(rawChecked);
      return {
        ...base,
        parameter_type: "gx_boolean",
        type: "boolean",
        value,
        truevalue: readNullableString(input.truevalue),
        falsevalue: readNullableString(input.falsevalue),
      };
    }
    case "hidden": {
      return {
        ...base,
        parameter_type: "gx_hidden",
        type: "hidden",
        value: readNullableString(input.value),
        validators: collectValidators(input.validators, "text") as (
          | RegexValidatorModel
          | LengthValidatorModel
          | ExpressionValidatorModel
          | EmptyFieldValidatorModel
        )[],
      };
    }
    case "color": {
      const value = typeof input.value === "string" ? input.value : "#000000";
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
        multiple: readBool(input.multiple, false),
        extensions: parseExtensions(input),
      };
    }
    case "data_collection": {
      return {
        ...base,
        parameter_type: "gx_data_collection",
        type: "data_collection",
        collection_type: readNullableString(input.collection_type),
        extensions: parseExtensions(input),
        value: input.default ?? input.value ?? null,
      };
    }
    case "select": {
      const multiple = readBool(input.multiple, false);
      const optional = base.optional;
      const options = parseStaticOptions(input);
      const validators = collectValidators(input.validators, "select") as ValidatorModel[];
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
        multiple: readBool(input.multiple, false),
        hierarchy: (input.hierarchy as "exact" | "recurse") === "recurse" ? "recurse" : "exact",
        options: parseDrillDownOptions(input.options) ?? [],
      };
    }
    case "data_column": {
      const multiple = readBool(input.multiple, false);
      const acceptDefault = readBool(input.accept_default, false);
      let optional = base.optional;
      let value = input.value as number | string | (string | number)[] | null | undefined;
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
        multiple: readBool(input.multiple, false),
      };
    }
    case "baseurl": {
      return {
        ...base,
        parameter_type: "gx_baseurl",
        type: "baseurl",
        value: readNullableString(input.value),
      };
    }
    case "genomebuild": {
      return {
        ...base,
        parameter_type: "gx_genomebuild",
        type: "genomebuild",
        multiple: readBool(input.multiple, false),
        options: [],
      };
    }
    case "directory_uri": {
      return {
        ...base,
        parameter_type: "gx_directory_uri",
        type: "directory_uri",
        value: readNullableString(input.value),
        validators: collectValidators(input.validators, "text") as ValidatorModel[],
      };
    }
    default:
      throw new Error(`Unknown Galaxy parameter type '${paramType}'`);
  }
}

function baseFields(input: Dict): {
  name: string;
  hidden: boolean;
  label: string | null;
  help: string | null;
  argument: string | null;
  is_dynamic: boolean;
  optional: boolean;
} {
  return {
    name: readString(input.name),
    hidden: readBool(input.hidden, false),
    label: readNullableString(input.label),
    help: readNullableString(input.help),
    argument: readNullableString(input.argument),
    is_dynamic: false,
    optional: readBool(input.optional, false),
  };
}

function textIsOptional(input: Dict): boolean {
  // Mirrors `text_input_is_optional`: explicit `optional:` wins, otherwise
  // inferred from `value:` being present.
  if (input.optional !== undefined && input.optional !== null) {
    return coerceBool(input.optional);
  }
  return input.value === undefined || input.value === null || input.value === "";
}

function textDefault(value: unknown, optional: boolean): string | null {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return optional ? null : "";
  return String(value);
}

function parseExtensions(input: Dict): string[] {
  const explicit = input.extensions;
  let raw: unknown = explicit;
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) {
    raw = input.format ?? "data";
  }
  let list: unknown[];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string") {
    list = raw.split(",");
  } else {
    list = ["data"];
  }
  return list.map((v) => String(v).trim().toLowerCase()).filter((v) => v !== "");
}

function parseStaticOptions(input: Dict): LabelValue[] | null {
  const opts = input.options;
  if (!Array.isArray(opts)) return null;
  const out: LabelValue[] = [];
  for (const item of opts) {
    if (!isDict(item)) continue;
    const value = (item as Dict).value;
    if (value === undefined) continue;
    const valueStr = String(value);
    const label =
      typeof (item as Dict).label === "string" ? ((item as Dict).label as string) : valueStr;
    const selected = readBool((item as Dict).selected, false);
    out.push({ label, value: valueStr, selected });
  }
  return out;
}

function parseDrillDownOptions(raw: unknown): DrillDownOption[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(isDict).map(parseDrillDownOption);
}

function parseDrillDownOption(entry: Dict): DrillDownOption {
  return {
    value: String(entry.value ?? ""),
    name: String(entry.name ?? entry.value ?? ""),
    options: parseDrillDownOptions(entry.options) ?? [],
    selected: readBool(entry.selected, false),
  };
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

function collectValidators(raw: unknown, kind: "number" | "text" | "select"): ValidatorModel[] {
  if (!Array.isArray(raw)) return [];
  const all: ValidatorModel[] = [];
  for (const entry of raw) {
    if (!isDict(entry)) continue;
    const v = parseValidatorDict(entry as Dict);
    if (v) all.push(v);
  }
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

function parseValidatorDict(entry: Dict): ValidatorModel | null {
  const type = readString(entry.type);
  const negate = readBool(entry.negate, false);
  switch (type) {
    case "in_range":
      return {
        type: "in_range",
        min: readNullableFloat(entry.min),
        max: readNullableFloat(entry.max),
        exclude_min: readBool(entry.exclude_min, false),
        exclude_max: readBool(entry.exclude_max, false),
        negate,
        message: readNullableString(entry.message),
      };
    case "regex":
      return { type: "regex", expression: readString(entry.expression), negate };
    case "length":
      return {
        type: "length",
        min: readNullableInt(entry.min),
        max: readNullableInt(entry.max),
        negate,
      };
    case "expression":
      return { type: "expression", expression: readString(entry.expression), negate };
    case "empty_field":
      return { type: "empty_field", negate };
    case "no_options":
      return { type: "no_options", negate };
    default:
      return null;
  }
}

function isDict(v: unknown): v is Dict {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function readString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function readNullableString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

function readBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return true;
    if (lower === "false" || lower === "no" || lower === "0") return false;
  }
  return fallback;
}

function readNullableInt(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

function readNullableFloat(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
