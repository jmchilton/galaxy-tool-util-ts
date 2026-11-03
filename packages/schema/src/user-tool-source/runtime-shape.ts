/**
 * What a user-defined tool's `inputs` hold when the job runs, and whether a
 * template's `inputs.*` member chain can be read from them.
 *
 * Galaxy evaluates each template expression against the job runtime `inputs`
 * object (`galaxy.tools.runtime`, `model_dump(by_alias=True)` of the
 * `galaxy.tool_util_models.parameters` runtime models). The field names come
 * from those models via `job-runtime.schema.json`. The legacy builder behind
 * `/api/tools` gives some inputs a different shape; this follows the runtime
 * model the workflow path uses.
 */

import type { ToolParameterModel } from "../schema/bundle-types.js";
import { jobRuntimeSchema } from "./job-runtime.schema.generated.js";
import type { InputsChain } from "./template-chains.js";

/**
 * What an `inputs` member holds at job runtime. `description` names objects,
 * arrays and keyed maps in messages; a primitive is named by its kind. A
 * `union` is any one of `options`, so a path is fine if any option has it.
 */
export type RuntimeShape =
  | { kind: "object"; description: string; fields: ReadonlyMap<string, RuntimeShape> }
  | { kind: "array"; description: string; element: RuntimeShape }
  | { kind: "keyed"; description: string; keys: readonly string[]; value: RuntimeShape }
  | { kind: "string" | "number" | "boolean" }
  | { kind: "union"; options: readonly RuntimeShape[] }
  | { kind: "unknown" };

const UNKNOWN: RuntimeShape = { kind: "unknown" };

/**
 * A JSON Schema property, as far as the shape model reads it. `$ref` and
 * `title` are listed so that every property in the synced schema is one.
 */
type JsonSchemaProperty = {
  $ref?: string;
  title?: string;
  type?: string;
  items?: JsonSchemaProperty;
  anyOf?: readonly JsonSchemaProperty[];
};

/** A model in the synced schema; a sync that drops one used here fails to compile. */
type RuntimeModel = keyof typeof jobRuntimeSchema.$defs;

const RUNTIME_DEFS: Record<
  RuntimeModel,
  { properties: Readonly<Record<string, JsonSchemaProperty>> }
> = jobRuntimeSchema.$defs;

function shapeOfProperty(prop: JsonSchemaProperty): RuntimeShape {
  if (prop.anyOf) {
    const nonNull = prop.anyOf.filter((p) => p.type !== "null");
    return nonNull.length === 1 ? shapeOfProperty(nonNull[0]) : UNKNOWN;
  }
  switch (prop.type) {
    case "string":
    case "boolean":
      return { kind: prop.type };
    case "integer":
    case "number":
      return { kind: "number" };
    case "array":
      return {
        kind: "array",
        description: "an array",
        element: prop.items ? shapeOfProperty(prop.items) : UNKNOWN,
      };
    default:
      return UNKNOWN;
  }
}

function modelShape(
  model: RuntimeModel,
  description: string,
  overrides: Record<string, RuntimeShape> = {},
): RuntimeShape {
  const fields = new Map<string, RuntimeShape>();
  for (const [name, prop] of Object.entries(RUNTIME_DEFS[model].properties)) {
    fields.set(name, overrides[name] ?? shapeOfProperty(prop));
  }
  return { kind: "object", description, fields };
}

const PAIRED_KEYS = Object.keys(RUNTIME_DEFS.DataCollectionPairedElements.properties);
// galaxy.model.dataset_collections.types.paired_or_unpaired: SINGLETON_IDENTIFIER plus the paired keys.
const PAIRED_OR_UNPAIRED_KEYS = [...PAIRED_KEYS, "unpaired"];

/** The `elements` of a collection, mirroring `_build_collection_runtime_dict`. */
function elementsShape(collectionType: string | null): RuntimeShape {
  // Unconstrained or a choice of types ("list,paired"): the shape isn't known statically.
  if (collectionType === null || collectionType.includes(",")) return UNKNOWN;
  const [outer, ...rest] = collectionType.split(":");
  const inner = rest.join(":");
  const dataset = modelShape("DataCollectionElementInternalJson", "a collection element");
  let element = inner ? collectionShape(inner, `a nested ${inner} collection`) : dataset;
  if (inner === "paired_or_unpaired") {
    // Galaxy also accepts a collection whose last rank is datasets (a plain `list` for
    // `list:paired_or_unpaired`) and passes it through as is, so an element may be a dataset.
    element = { kind: "union", options: [element, dataset] };
  }
  const description = `the elements of a ${outer} collection`;
  if (outer === "list" || outer === "sample_sheet") return { kind: "array", description, element };
  if (outer === "paired") return { kind: "keyed", description, keys: PAIRED_KEYS, value: element };
  if (outer === "paired_or_unpaired") {
    return { kind: "keyed", description, keys: PAIRED_OR_UNPAIRED_KEYS, value: element };
  }
  // `record` keys are its fields, which a data_collection input doesn't declare.
  return UNKNOWN;
}

function collectionShape(collectionType: string | null, description: string): RuntimeShape {
  return modelShape("DataCollectionInternalJsonBase", description, {
    elements: elementsShape(collectionType),
  });
}

/** The runtime value of one input, mirroring `runtimeify` over the tool state. */
function parameterShape(param: ToolParameterModel, name: string): RuntimeShape {
  switch (param.parameter_type) {
    case "gx_data": {
      const dataset = modelShape("DataInternalJson", `data input '${name}'`);
      if (!param.multiple) return dataset;
      return { kind: "array", description: `multiple data input '${name}'`, element: dataset };
    }
    case "gx_data_collection": {
      const type = param.collection_type ? ` (${param.collection_type})` : "";
      return collectionShape(param.collection_type, `data_collection input '${name}'${type}`);
    }
    case "gx_integer":
    case "gx_float":
      return { kind: "number" };
    case "gx_boolean":
      return { kind: "boolean" };
    case "gx_text":
    case "gx_color":
    case "gx_hidden":
      return { kind: "string" };
    case "gx_select":
      if (!param.multiple) return { kind: "string" };
      return {
        kind: "array",
        description: `multiple select input '${name}'`,
        element: { kind: "string" },
      };
    // The TS YAML parser doesn't read sections yet (Galaxy's YAML v1 set does).
    case "gx_section":
      return {
        kind: "object",
        description: `section '${name}'`,
        fields: inputShapes(param.parameters, name),
      };
    case "gx_repeat":
      return {
        kind: "array",
        description: `repeat '${name}'`,
        element: {
          kind: "object",
          description: `a block of repeat '${name}'`,
          fields: inputShapes(param.parameters, `${name}[]`),
        },
      };
    case "gx_conditional": {
      // Only the selected branch is present, so any branch's parameters may be read.
      const params = [param.test_parameter, ...param.whens.flatMap((w) => w.parameters)];
      return {
        kind: "object",
        description: `conditional '${name}'`,
        fields: inputShapes(params, name),
      };
    }
    default:
      return UNKNOWN;
  }
}

/**
 * The shape of each named parameter: the top-level inputs, or the children of
 * `parentName`. Conditional branches may each declare a parameter of the same
 * name with a different type; the name then holds any of them.
 */
export function inputShapes(
  params: readonly ToolParameterModel[],
  parentName: string | null = null,
): Map<string, RuntimeShape> {
  const fields = new Map<string, RuntimeShape>();
  for (const p of params) {
    const shape = parameterShape(p, parentName ? `${parentName}.${p.name}` : p.name);
    const existing = fields.get(p.name);
    if (!existing) fields.set(p.name, shape);
    else {
      const options = existing.kind === "union" ? existing.options : [existing];
      fields.set(p.name, { kind: "union", options: [...options, shape] });
    }
  }
  return fields;
}

// --------------------------------------------------------------------------
// Resolving chains
// --------------------------------------------------------------------------

const PRIMITIVE_PROTOTYPES: Record<"string" | "number" | "boolean", object> = {
  string: String.prototype,
  number: Number.prototype,
  boolean: Boolean.prototype,
};

function render(chain: InputsChain): string {
  return ["inputs", ...chain]
    .map((s, i) => (s === null ? "[…]" : i === 0 ? s : /^\d+$/.test(s) ? `[${s}]` : `.${s}`))
    .join("");
}

function fieldList(names: Iterable<string>): string {
  const sorted = [...names].sort();
  return sorted.length ? sorted.join(", ") : "none";
}

/**
 * Why `chain` (root input name first) can't be read from the job's inputs, or
 * null when it can, or when the runtime shape isn't known statically.
 */
export function resolveChain(
  chain: InputsChain,
  inputs: ReadonlyMap<string, RuntimeShape>,
): string | null {
  const shape = chain[0] === null ? undefined : inputs.get(chain[0]);
  return shape ? resolveFrom(chain, 1, shape) : null;
}

/** Why `chain[i...]` can't be read from `shape`, or null when it can. */
function resolveFrom(chain: InputsChain, i: number, shape: RuntimeShape): string | null {
  if (i >= chain.length) return null;
  const seg = chain[i];
  const path = render(chain.slice(0, i + 1));
  switch (shape.kind) {
    case "unknown":
      return null;
    case "union": {
      const problems = shape.options.map((option) => resolveFrom(chain, i, option));
      return problems.includes(null) ? null : problems[0];
    }
    case "object": {
      if (seg === null) return null;
      const next = shape.fields.get(seg);
      if (next) return resolveFrom(chain, i + 1, next);
      if (seg in Object.prototype) return null;
      const elements = shape.fields.get("elements");
      const hint =
        elements?.kind === "keyed" && elements.keys.includes(seg)
          ? ` Use ${render([...chain.slice(0, i), "elements", seg])}.`
          : "";
      return `${path}: ${shape.description} has no field '${seg}' at job runtime (fields: ${fieldList(shape.fields.keys())}).${hint}`;
    }
    case "array":
      if (seg === null || /^\d+$/.test(seg)) return resolveFrom(chain, i + 1, shape.element);
      if (seg in Array.prototype) return null;
      return `${path}: ${shape.description} is an array at job runtime and has no field '${seg}'.`;
    case "keyed":
      if (seg === null || shape.keys.includes(seg)) return resolveFrom(chain, i + 1, shape.value);
      if (seg in Object.prototype) return null;
      return `${path}: ${shape.description} has no element '${seg}' (elements: ${fieldList(shape.keys)}).`;
    default:
      if (seg === null || seg in PRIMITIVE_PROTOTYPES[shape.kind]) return null;
      // Indexing a string reads a character.
      if (shape.kind === "string" && /^\d+$/.test(seg)) return null;
      return `${path}: ${render(chain.slice(0, i))} is a ${shape.kind} at job runtime and has no field '${seg}'.`;
  }
}
