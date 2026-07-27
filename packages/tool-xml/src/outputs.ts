import { parseDiscoverDatasets } from "@galaxy-tool-util/schema";
import type {
  DatasetCollectionDescription,
  ToolOutput,
  ToolOutputCollection,
  ToolOutputCollectionStructure,
  ToolOutputDataset,
} from "@galaxy-tool-util/schema";

import { stringAsBool, xmlText, xmlTextOrNull } from "./element.js";
import type { XmlElement } from "./element.js";

/**
 * Port of ``XmlToolSource.parse_outputs`` + ``output_objects.from_tool_source``
 * — turns an expanded ``<outputs>`` tree into the `ToolOutput` union from
 * `@galaxy-tool-util/schema`. The `discover_datasets` translation reuses that
 * package's shared descriptor parser (Galaxy shares `dataset_collection_description`
 * across the XML and YAML paths too).
 *
 * Raw extraction: the collection-structure invariants Python's
 * `ToolOutputCollectionStructure.__init__` raises on (e.g. both `type` and
 * `type_source`) are not enforced here; those land with `ParsedTool` assembly.
 */
export function parseOutputs(root: XmlElement, profile: string): ToolOutput[] {
  const outElem = root.findChild("outputs");
  if (outElem === null) return [];
  // ``legacy_defaults = Version(parse_profile()) == Version("16.01")``.
  const legacy = profile === "16.01";

  const dataDict = new Map<string, ToolOutputDataset>();
  const collections = new Map<string, ToolOutput>();
  const expressionDict = new Map<string, ToolOutput>();

  // Pass 1 mirrors Python's initial ``for _ in out_elem.findall("data")``.
  for (const dataEl of outElem.findChildren("data")) {
    const out = parseOutputData(dataEl, legacy, profile);
    dataDict.set(out.name, out);
  }

  // Main pass over direct children in document order.
  for (const child of outElem.children) {
    if (child.tag === "data") {
      const out = parseOutputData(child, legacy, profile);
      dataDict.set(out.name, out);
    } else if (child.tag === "collection") {
      const coll = parseOutputCollection(child);
      collections.set(coll.name, coll);
    } else if (child.tag === "output") {
      const outputType = child.attrs.get("type");
      if (outputType === "data") {
        const out = parseOutputData(child, legacy, profile);
        dataDict.set(out.name, out);
      } else if (outputType === "collection") {
        // Python remaps collection_type/collection_type_source onto type/type_source.
        // Note: this form is effectively unusable upstream — Python assigns
        // `unicodify(None)` into an ElementTree attribute and raises TypeError
        // when either is absent (and ValueError when both are set). We handle it
        // gracefully instead of reproducing that breakage.
        const coll = parseOutputCollection(child, {
          collectionType: child.attrs.get("collection_type") ?? null,
          collectionTypeSource: child.attrs.get("collection_type_source") ?? null,
        });
        collections.set(coll.name, coll);
      } else {
        const expr = parseExpressionOutput(child);
        expressionDict.set(expr.name, expr);
      }
    }
    // Unknown tags are skipped (Python logs a warning).
  }

  // Final order: collections (document order), then data, then expression —
  // Python builds `outputs` with collections during the loop, then
  // `chain(data_dict.values(), expression_dict.values())`.
  const outputs = new Map<string, ToolOutput>(collections);
  for (const out of dataDict.values()) outputs.set(out.name, out);
  for (const out of expressionDict.values()) outputs.set(out.name, out);
  return [...outputs.values()];
}

function parseOutputData(el: XmlElement, legacy: boolean, profile: string): ToolOutputDataset {
  let format = el.attrs.get("format") ?? "data";
  const autoFormat = stringAsBool(el.attrs.get("auto_format"));
  if (autoFormat && format !== "data") {
    throw new Error("Setting format and auto_format is not supported at this time.");
  }
  if (autoFormat) format = "_sniff_";

  let fromWorkDir = el.attrs.get("from_work_dir") ?? null;
  // Pre-21.09 tools quoted from_work_dir without stripping; keep them working.
  if (fromWorkDir && profileLt(profile, "21.09")) fromWorkDir = fromWorkDir.trim();

  return {
    name: el.attrs.get("name") ?? "",
    label: xmlTextOrNull(el, "label"),
    hidden: stringAsBool(el.attrs.get("hidden")),
    type: "data",
    format,
    format_source: el.attrs.get("format_source") ?? null,
    metadata_source: el.attrs.get("metadata_source") ?? null,
    discover_datasets: parseDataDiscover(el, legacy),
    from_work_dir: fromWorkDir,
    precreate_directory: stringAsBool(el.attrs.get("precreate_directory")),
  };
}

interface CollectionTypeOverride {
  collectionType: string | null;
  collectionTypeSource: string | null;
}

function parseOutputCollection(
  el: XmlElement,
  override?: CollectionTypeOverride,
): ToolOutputCollection {
  const structure: ToolOutputCollectionStructure = {
    collection_type: override ? override.collectionType : (el.attrs.get("type") ?? null),
    collection_type_source: override
      ? override.collectionTypeSource
      : (el.attrs.get("type_source") ?? null),
    collection_type_from_rules: el.attrs.get("type_from_rules") ?? null,
    structured_like: el.attrs.get("structured_like") ?? null,
    // <collection> discover_datasets are always parsed non-legacy.
    discover_datasets: parseDataDiscover(el, false),
  };
  return {
    name: el.attrs.get("name") ?? "",
    // _parse_collection uses xml_text (default ""), unlike data's None default.
    label: xmlText(el, "label"),
    // Python's _parse_collection never reads a hidden attribute on collections.
    hidden: false,
    type: "collection",
    ...structure,
  };
}

const EXPRESSION_TYPES = new Set(["integer", "float", "boolean", "text"]);

function parseExpressionOutput(el: XmlElement): ToolOutput {
  const type = el.attrs.get("type");
  if (type === undefined || !EXPRESSION_TYPES.has(type)) {
    throw new Error(`Unknown output type encountered [${type ?? ""}]`);
  }
  return {
    name: el.attrs.get("name") ?? "",
    label: xmlTextOrNull(el, "label"),
    hidden: stringAsBool(el.attrs.get("hidden")),
    type,
  } as ToolOutput;
}

/**
 * Port of ``dataset_collector_descriptions_from_elem`` — collect the
 * ``<discover_datasets>`` blocks (inheriting the element's ``format`` attribute
 * when a block sets neither ``format`` nor ``ext``), or the single default
 * collector when there are none and the tool is legacy (profile 16.01).
 */
function parseDataDiscover(el: XmlElement, legacy: boolean): DatasetCollectionDescription[] {
  const blocks = el.findChildren("discover_datasets");
  if (blocks.length === 0 && legacy) {
    return parseDiscoverDatasets([{}]) ?? [];
  }
  const defaultFormat = el.attrs.get("format");
  const dicts = blocks.map((block) => {
    const attrs: Record<string, string> = Object.fromEntries(block.attrs);
    if (defaultFormat && !("format" in attrs) && !("ext" in attrs)) {
      attrs.format = defaultFormat;
    }
    return attrs;
  });
  return parseDiscoverDatasets(dicts) ?? [];
}

/** ``Version(a) < Version(b)`` for dotted numeric tool profile strings. */
function profileLt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
