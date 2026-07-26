/**
 * `InputSource` / `PageSource` seam — the TS mirror of Galaxy's
 * `galaxy.tool_util.parser.interface.InputSource` / `PageSource`. Decouples the
 * input-tree walk (who reads the source) from the parameter-model factory in
 * `./inputs.ts` (the `_from_input_source_galaxy` + `input_models_for_page`
 * equivalent), so an XML-backed source in `@galaxy-tool-util/tool-xml` can feed
 * the same factory.
 *
 * This module is the dependency-free interface plus the inline/YAML dict
 * implementation (`DictInputSource` / `DictPageSource`), mirroring Galaxy's
 * `YamlInputSource` / `YamlPageSource`. Coercion here is dict-native (native
 * YAML bools/numbers pass through `get`; string coercion matches the previous
 * inline reads) — it deliberately does NOT adopt XML's `string_as_bool`
 * semantics, which live on the XML source in `tool-xml`.
 *
 * Only the methods the current factory consumes are on the interface. Further
 * Galaxy accessors (dynamic options, `get_bool_or_none`, conversion tuples,
 * sanitizers) land with the feature slices that need them.
 */

import type { LabelValue, DrillDownOption, ValidatorModel } from "../schema/bundle-types.js";

/**
 * Container discriminator returned by `parseInputType`. `"section"` is returned
 * only by the XML source (`tag == "section"`). `DictInputSource` mirrors
 * `YamlInputSource.parse_input_type`, which maps only `repeat`/`conditional` and
 * treats everything else (including `section`) as `"param"` — YAML sections are
 * intentionally unsupported until Galaxy's YAML path supports them.
 */
export type InputType = "param" | "conditional" | "repeat" | "section";

export interface PageSource {
  parseInputSources(): InputSource[];
}

export interface InputSource {
  /** Raw named property (string for XML, native value for dict). */
  get(key: string, defaultValue?: unknown): unknown;
  /** Named property coerced to boolean. */
  getBool(key: string, defaultValue: boolean): boolean;
  parseInputType(): InputType;
  parseName(): string;
  parseLabel(): string | null;
  parseHelp(): string | null;
  parseOptional(defaultValue?: boolean): boolean;
  parseExtensions(): string[];
  /** Static `<option>` list for selects, or `null` when none are defined. */
  parseStaticOptions(): LabelValue[] | null;
  parseDrillDownStaticOptions(): DrillDownOption[] | null;
  parseValidators(): ValidatorModel[];
  /** Nested inputs for a repeat/section container. */
  parseNestedInputsSource(): PageSource;
  /** `test_parameter` source for a conditional. */
  parseTestInputSource(): InputSource;
  /** `[discriminator, page]` pairs for a conditional's whens. */
  parseWhenInputSources(): Array<[unknown, PageSource]>;
  parseDefault(): unknown;
}

type Dict = Record<string, unknown>;

export class DictPageSource implements PageSource {
  constructor(private readonly raw: unknown) {}

  parseInputSources(): InputSource[] {
    return normalizeInputList(this.raw).map((d) => new DictInputSource(d));
  }
}

export class DictInputSource implements InputSource {
  constructor(private readonly input: Dict) {}

  get(key: string, defaultValue?: unknown): unknown {
    const v = this.input[key];
    return v === undefined ? defaultValue : v;
  }

  getBool(key: string, defaultValue: boolean): boolean {
    return readBool(this.input[key], defaultValue);
  }

  parseInputType(): InputType {
    const t = this.input.type;
    if (t === "conditional") return "conditional";
    if (t === "repeat") return "repeat";
    return "param";
  }

  parseName(): string {
    return readString(this.input.name);
  }

  parseLabel(): string | null {
    return readNullableString(this.input.label);
  }

  parseHelp(): string | null {
    return readNullableString(this.input.help);
  }

  parseOptional(defaultValue = false): boolean {
    return readBool(this.input.optional, defaultValue);
  }

  parseExtensions(): string[] {
    const explicit = this.input.extensions;
    let raw: unknown = explicit;
    if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) {
      raw = this.input.format ?? "data";
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

  parseStaticOptions(): LabelValue[] | null {
    const opts = this.input.options;
    if (!Array.isArray(opts)) return null;
    const out: LabelValue[] = [];
    for (const item of opts) {
      if (!isDict(item)) continue;
      const value = item.value;
      if (value === undefined) continue;
      const valueStr = String(value);
      const label = typeof item.label === "string" ? item.label : valueStr;
      const selected = readBool(item.selected, false);
      out.push({ label, value: valueStr, selected });
    }
    return out;
  }

  parseDrillDownStaticOptions(): DrillDownOption[] | null {
    return parseDrillDownOptions(this.input.options);
  }

  parseValidators(): ValidatorModel[] {
    const raw = this.input.validators;
    if (!Array.isArray(raw)) return [];
    const all: ValidatorModel[] = [];
    for (const entry of raw) {
      if (!isDict(entry)) continue;
      const v = parseValidatorDict(entry);
      if (v) all.push(v);
    }
    return all;
  }

  parseNestedInputsSource(): PageSource {
    const inner = this.input.blocks ?? this.input.parameters ?? this.input.inputs;
    return new DictPageSource(inner);
  }

  parseTestInputSource(): InputSource {
    const testRaw = this.input.test_parameter;
    if (!isDict(testRaw)) {
      throw new Error(`conditional '${this.parseName()}' must define a 'test_parameter'`);
    }
    return new DictInputSource(testRaw);
  }

  parseWhenInputSources(): Array<[unknown, PageSource]> {
    const out: Array<[unknown, PageSource]> = [];
    // YAML supports two shapes: `when: {key: [params], ...}` (map) and `whens:
    // [{discriminator, parameters: [...]}]` (list).
    const whenMap = this.input.when;
    const whenList = this.input.whens;
    if (isDict(whenMap)) {
      for (const [key, value] of Object.entries(whenMap)) {
        out.push([key, new DictPageSource(Array.isArray(value) ? value : [])]);
      }
    } else if (Array.isArray(whenList)) {
      for (const item of whenList) {
        if (!isDict(item)) continue;
        out.push([item.discriminator, new DictPageSource(item.parameters)]);
      }
    }
    return out;
  }

  parseDefault(): unknown {
    return this.input.default;
  }
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

// --- Shared dict coercion helpers (also used by the factory in ./inputs.ts). ---

export function isDict(v: unknown): v is Dict {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function readString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function readNullableString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

export function readBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return true;
    if (lower === "false" || lower === "no" || lower === "0") return false;
  }
  return fallback;
}

export function coerceBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return true;
    return false;
  }
  return Boolean(v);
}

export function readNullableInt(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

export function readNullableFloat(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
