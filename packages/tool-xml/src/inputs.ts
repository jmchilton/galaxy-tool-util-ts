import { inputModelsForPage } from "@galaxy-tool-util/schema";
import type {
  DrillDownOption,
  InputSource,
  InputType,
  LabelValue,
  PageSource,
  ToolParameterModel,
  ValidatorModel,
} from "@galaxy-tool-util/schema";

import { stringAsBool, xmlText } from "./element.js";
import type { XmlElement } from "./element.js";

/**
 * XML-backed `InputSource` / `PageSource` — the TS port of Galaxy's
 * `parser.xml.XmlInputSource` / `XmlPageSource`. It adapts an `<inputs>` tree
 * (already macro-expanded) onto the seam consumed by the shared parameter-model
 * factory in `@galaxy-tool-util/schema`, so XML and the inline/YAML dict path
 * build the same `ToolParameterModel` union.
 *
 * Coercion here is XML-native: attribute reads default to string, booleans go
 * through `string_as_bool`, and `parse_static_options` deduplicates `<option>`
 * children by `value` (mirroring the Python source). Dynamic-option detection
 * nulls a select's / drill-down's options but the option source itself is not
 * modeled. Accessors the factory does not consume yet (conversion tuples,
 * sanitizers) are stubbed to their empty forms and grow with the feature slices
 * that need them.
 */

/** Port of `XmlToolSource.parse_inputs` entry — `<inputs>` tree → models. */
export function parseInputs(root: XmlElement): ToolParameterModel[] {
  const inputsElem = root.findChild("inputs");
  if (inputsElem === null) return [];
  return inputModelsForPage(new XmlPageSource(inputsElem));
}

/** Port of `parser.xml.XmlPageSource`. */
export class XmlPageSource implements PageSource {
  constructor(private readonly parentElem: XmlElement) {}

  parseInputSources(): InputSource[] {
    return this.parentElem.children.map((child) => new XmlInputSource(child));
  }
}

/** Port of `parser.xml.XmlInputSource`. */
export class XmlInputSource implements InputSource {
  constructor(private readonly inputElem: XmlElement) {}

  get(key: string, defaultValue?: unknown): unknown {
    const v = this.inputElem.attrs.get(key);
    return v === undefined ? defaultValue : v;
  }

  getBool(key: string, defaultValue: boolean): boolean {
    const v = this.inputElem.attrs.get(key);
    return v === undefined ? defaultValue : stringAsBool(v);
  }

  parseInputType(): InputType {
    const tag = this.inputElem.tag;
    if (tag === "conditional") return "conditional";
    if (tag === "repeat") return "repeat";
    if (tag === "section") return "section";
    if (tag === "display") return "display";
    return "param";
  }

  parseName(): string {
    // Mirror `util._parse_name`: prefer `name`, else derive from `argument`
    // (strip leading dashes, dashes → underscores).
    const name = this.inputElem.attrs.get("name");
    if (name !== undefined) return name;
    const argument = this.inputElem.attrs.get("argument");
    if (argument === undefined) {
      throw new Error("parameter must specify a 'name' or 'argument'.");
    }
    return argument.replace(/^-+/, "").replace(/-/g, "_");
  }

  parseLabel(): string | null {
    // `_common_param_kwargs` drops a falsy label, so empty ≡ absent ≡ null.
    return xmlText(this.inputElem, "label") || null;
  }

  parseHelp(): string | null {
    return xmlText(this.inputElem, "help") || null;
  }

  parseOptional(defaultValue = false): boolean {
    const elem = this.inputElem;
    if (this.get("type") === "data_column") {
      // `force_select` is the legacy inverse of `optional`.
      const forceSelect = elem.attrs.has("force_select")
        ? stringAsBool(elem.attrs.get("force_select"))
        : !this.getBool("optional", false);
      return !forceSelect;
    }
    return this.getBool("optional", defaultValue);
  }

  parseExtensions(): string[] {
    const raw = this.get("format", "data") as string;
    return raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e !== "");
  }

  hasDynamicOptions(): boolean {
    // Mirror `XmlInputSource.parse_dynamic_options`: dynamic when an <options>
    // element is present or a `dynamic_options` code attribute is set.
    return (
      this.inputElem.findChild("options") !== null || this.inputElem.attrs.has("dynamic_options")
    );
  }

  parseStaticOptions(): LabelValue[] | null {
    // Deduplicate by `value` in document order (last wins) — matches Python.
    const deduped = new Map<string, LabelValue>();
    for (const option of this.inputElem.findChildren("option")) {
      const value = option.attrs.get("value") ?? "";
      const label = option.text.trim() || value;
      const selected = stringAsBool(option.attrs.get("selected"));
      deduped.set(value, { label, value, selected });
    }
    return [...deduped.values()];
  }

  hasDrillDownDynamicOptions(): boolean {
    // Mirror `parse_drill_down_dynamic_options`: dynamic only via a
    // `dynamic_options` code attribute (a static <options> tree is not dynamic).
    return this.inputElem.attrs.has("dynamic_options");
  }

  parseDrillDownStaticOptions(): DrillDownOption[] | null {
    const optionsElem = this.inputElem.findChild("options");
    if (optionsElem === null) return null;
    return recurseDrillDownElems(optionsElem.findChildren("option"));
  }

  parseValidators(): ValidatorModel[] {
    return parseXmlValidators(this.inputElem);
  }

  parseNestedInputsSource(): PageSource {
    return new XmlPageSource(this.inputElem);
  }

  parseTestInputSource(): InputSource {
    const paramElem = this.inputElem.findChild("param");
    if (paramElem === null) {
      throw new Error("<conditional> must have a child <param>");
    }
    return new XmlInputSource(paramElem);
  }

  parseWhenInputSources(): Array<[unknown, PageSource]> {
    return this.inputElem
      .findChildren("when")
      .map((caseElem) => [caseElem.attrs.get("value"), new XmlPageSource(caseElem)]);
  }

  parseDefault(): unknown {
    // Port of `XmlInputSource.parse_default`: a `<default>` child becomes a
    // File dict for `data`, or a nested Collection dict otherwise.
    const elem = this.inputElem;
    const defaultElem = elem.findChild("default");
    if (defaultElem === null) return null;
    if (elem.attrs.get("type") === "data") {
      return fileDefaultFromElem(defaultElem);
    }
    return {
      class: "Collection",
      name: defaultElem.attrs.get("name") ?? elem.attrs.get("name") ?? null,
      collection_type: defaultElem.attrs.get("collection_type") ?? null,
      elements: readDefaultElements(defaultElem),
    };
  }
}

function fileDefaultFromElem(elem: XmlElement): Record<string, unknown> {
  return { class: "File", location: elem.attrs.get("location") ?? null };
}

function readDefaultElements(collectionElem: XmlElement): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const element of collectionElem.findChildren("element")) {
    const identifier = element.attrs.get("name") ?? null;
    const subcollection = element.findChild("collection");
    if (subcollection !== null) {
      out.push({
        class: "Collection",
        identifier,
        collection_type: subcollection.attrs.get("collection_type") ?? null,
        elements: readDefaultElements(subcollection),
      });
    } else {
      out.push({ ...fileDefaultFromElem(element), identifier });
    }
  }
  return out;
}

function recurseDrillDownElems(optionElems: XmlElement[]): DrillDownOption[] {
  return optionElems.map((optionElem) => ({
    value: optionElem.attrs.get("value") ?? "",
    name: optionElem.attrs.get("name") ?? optionElem.attrs.get("value") ?? "",
    options: recurseDrillDownElems(optionElem.findChildren("option")),
    selected: stringAsBool(optionElem.attrs.get("selected")),
  }));
}

/**
 * Port of `parse_xml_validators` restricted to the validator kinds the factory
 * keeps (`filter_validators`): `in_range`, `regex`, `length`, `expression`,
 * `empty_field`, `no_options`. Other kinds parse in Python only to be dropped
 * downstream, so they are skipped here rather than modeled.
 */
function parseXmlValidators(inputElem: XmlElement): ValidatorModel[] {
  const models: ValidatorModel[] = [];
  for (const el of inputElem.findChildren("validator")) {
    const model = parseXmlValidator(el);
    if (model) models.push(model);
  }
  return models;
}

function parseXmlValidator(el: XmlElement): ValidatorModel | null {
  const type = el.attrs.get("type");
  const negate = stringAsBool(el.attrs.get("negate"));
  const message = el.attrs.get("message") ?? null;
  switch (type) {
    case "in_range":
      return {
        type: "in_range",
        min: numberAttr(el, "min"),
        max: numberAttr(el, "max"),
        exclude_min: stringAsBool(el.attrs.get("exclude_min")),
        exclude_max: stringAsBool(el.attrs.get("exclude_max")),
        negate,
        message,
      };
    case "regex":
      return { type: "regex", expression: el.text.trim(), negate };
    case "length":
      return {
        type: "length",
        min: intAttr(el, "min"),
        max: intAttr(el, "max"),
        negate,
      };
    case "expression":
      return { type: "expression", expression: el.text.trim(), negate };
    case "empty_field":
      return { type: "empty_field", negate };
    case "no_options":
      return { type: "no_options", negate };
    default:
      return null;
  }
}

function numberAttr(el: XmlElement, key: string): number | null {
  const raw = el.attrs.get(key);
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function intAttr(el: XmlElement, key: string): number | null {
  const raw = el.attrs.get(key);
  if (raw === undefined || raw === "") return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}
