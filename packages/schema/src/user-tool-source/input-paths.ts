/**
 * Check the `inputs.*` member paths a user-defined tool's templates read
 * against what its inputs hold when the job runs.
 *
 * `shell_command` and `configfiles[].content` are JavaScript templates: Galaxy
 * evaluates each `$(...)` expression and `${...}` function body against the
 * job runtime `inputs` object (`galaxy.tools.runtime`, `model_dump(by_alias=True)`
 * of the `galaxy.tool_util_models.parameters` runtime models). The field names
 * come from those models via `job-runtime.schema.json`. The legacy builder behind
 * `/api/tools` gives some inputs a different shape; this check follows the
 * runtime model the workflow path uses.
 *
 * Output `label`s are not JavaScript. Galaxy fills `$(inputs.<name>.<key>...)`
 * references from the tool state when the job is created
 * (`galaxy.tools.expressions.labels`) and keeps a reference it can't fill in
 * as written.
 *
 * Unknown root names are left to the `undeclared input` check that mirrors
 * Galaxy's model validator, so each mistake is reported once.
 */

import { parse as parseJs } from "acorn";
import type { ToolParameterModel } from "../schema/bundle-types.js";
import { parseInputs } from "../user-tool-parse/inputs.js";
import { jobRuntimeSchema } from "./job-runtime.schema.generated.js";
import type { UserToolSourceDiagnostic } from "./validate.js";

const KEYWORD = "input_path";

// --------------------------------------------------------------------------
// Runtime value shapes
// --------------------------------------------------------------------------

/**
 * What an `inputs` member holds at job runtime. `description` names objects,
 * arrays and keyed maps in messages; a primitive is named by its kind.
 */
type RuntimeShape =
  | { kind: "object"; description: string; fields: ReadonlyMap<string, RuntimeShape> }
  | { kind: "array"; description: string; element: RuntimeShape }
  | { kind: "keyed"; description: string; keys: readonly string[]; value: RuntimeShape }
  | { kind: "string" | "number" | "boolean" }
  | { kind: "unknown" };

const UNKNOWN: RuntimeShape = { kind: "unknown" };

type JsonSchemaProperty = {
  type?: string;
  items?: JsonSchemaProperty;
  anyOf?: readonly JsonSchemaProperty[];
};

const RUNTIME_DEFS = jobRuntimeSchema.$defs as unknown as Record<
  string,
  { properties: Record<string, JsonSchemaProperty> }
>;

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
  modelName: string,
  description: string,
  overrides: Record<string, RuntimeShape> = {},
): RuntimeShape {
  const def = RUNTIME_DEFS[modelName];
  if (!def) throw new Error(`job-runtime.schema.json has no model ${modelName}`);
  const fields = new Map<string, RuntimeShape>();
  for (const [name, prop] of Object.entries(def.properties)) {
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
  const element = inner
    ? collectionShape(inner, `a nested ${inner} collection`)
    : modelShape("DataCollectionElementInternalJson", "a collection element");
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
    case "gx_section":
      return {
        kind: "object",
        description: `section '${name}'`,
        fields: childShapes(param.parameters, name),
      };
    case "gx_repeat":
      return {
        kind: "array",
        description: `repeat '${name}'`,
        element: {
          kind: "object",
          description: `a block of repeat '${name}'`,
          fields: childShapes(param.parameters, `${name}[]`),
        },
      };
    case "gx_conditional": {
      // Only the selected branch is present, so any branch's parameters may be read.
      const params = [param.test_parameter, ...param.whens.flatMap((w) => w.parameters)];
      return {
        kind: "object",
        description: `conditional '${name}'`,
        fields: childShapes(params, name),
      };
    }
    default:
      return UNKNOWN;
  }
}

function childShapes(
  params: readonly ToolParameterModel[],
  parentName: string | null,
): Map<string, RuntimeShape> {
  const fields = new Map<string, RuntimeShape>();
  for (const p of params) {
    if (!fields.has(p.name)) {
      fields.set(p.name, parameterShape(p, parentName ? `${parentName}.${p.name}` : p.name));
    }
  }
  return fields;
}

// --------------------------------------------------------------------------
// Template scanning
// --------------------------------------------------------------------------

interface TemplateExpression {
  /** `paren` for `$(...)`, `brace` for `${...}`. */
  kind: "paren" | "brace";
  body: string;
}

/**
 * Port of `cwl_utils.expression.scanner`: the next `$(...)` / `${...}` window,
 * or a backslash escape, as `[start, end)`. Returns null when none remains or
 * the block is unterminated (Galaxy's `validate_expression_template` reports that).
 */
function scanWindow(scan: string): [number, number] | null {
  type State = "default" | "dollar" | "paren" | "brace" | "single" | "double" | "backslash";
  const stack: State[] = ["default"];
  let start = 0;
  for (let i = 0; i < scan.length; i++) {
    const c = scan[i];
    switch (stack[stack.length - 1]) {
      case "default":
        if (c === "$") stack.push("dollar");
        else if (c === "\\") stack.push("backslash");
        break;
      case "backslash":
        stack.pop();
        if (stack[stack.length - 1] === "default") return [i - 1, i + 1];
        break;
      case "dollar":
        if (c === "(") {
          start = i - 1;
          stack.push("paren");
        } else if (c === "{") {
          start = i - 1;
          stack.push("brace");
        } else {
          stack.pop();
          i--;
        }
        break;
      case "paren":
      case "brace": {
        const open = stack[stack.length - 1] === "paren" ? "(" : "{";
        const close = open === "(" ? ")" : "}";
        if (c === open) stack.push(stack[stack.length - 1]);
        else if (c === close) {
          stack.pop();
          if (stack[stack.length - 1] === "dollar") return [start, i + 1];
        } else if (c === "'") stack.push("single");
        else if (c === '"') stack.push("double");
        break;
      }
      case "single":
      case "double":
        if (c === (stack[stack.length - 1] === "single" ? "'" : '"')) stack.pop();
        else if (c === "\\") stack.push("backslash");
        break;
    }
  }
  return null;
}

function templateExpressions(template: string): TemplateExpression[] {
  const found: TemplateExpression[] = [];
  let scan = template;
  for (let window = scanWindow(scan); window; window = scanWindow(scan)) {
    const [start, end] = window;
    if (scan[start] === "$") {
      found.push({
        kind: scan[start + 1] === "(" ? "paren" : "brace",
        body: scan.slice(start + 2, end - 1),
      });
    }
    scan = scan.slice(end);
  }
  return found;
}

// --------------------------------------------------------------------------
// `inputs.*` member chains
// --------------------------------------------------------------------------

/** One step of a member chain: a property name, or null for a computed key. */
type Segment = string | null;

interface AstNode {
  type: string;
  [key: string]: unknown;
}

function isNode(value: unknown): value is AstNode {
  return !!value && typeof value === "object" && typeof (value as AstNode).type === "string";
}

function memberSegment(node: AstNode): Segment {
  const property = node.property as AstNode;
  if (!node.computed) return property.name as string;
  if (
    property.type === "Literal" &&
    (typeof property.value === "string" || typeof property.value === "number")
  ) {
    return String(property.value);
  }
  return null;
}

/** The segments after `inputs` when `node` is a member chain rooted at the `inputs` identifier. */
function inputsChain(node: AstNode): Segment[] | null {
  const segments: Segment[] = [];
  let current: AstNode = node;
  while (current.type === "MemberExpression") {
    segments.unshift(memberSegment(current));
    current = current.object as AstNode;
  }
  return current.type === "Identifier" && current.name === "inputs" ? segments : null;
}

/** Every maximal `inputs...` member chain in `root`. */
function collectChains(root: AstNode): Segment[][] {
  const chains: Segment[][] = [];
  const visit = (node: AstNode): void => {
    if (node.type === "MemberExpression") {
      const chain = inputsChain(node);
      if (chain) {
        chains.push(chain);
        // Computed keys inside the chain (`inputs.a[inputs.b]`) are chains of their own.
        for (let m: AstNode = node; m.type === "MemberExpression"; m = m.object as AstNode) {
          if (m.computed) visit(m.property as AstNode);
        }
        return;
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((v) => isNode(v) && visit(v));
      else if (isNode(value)) visit(value);
    }
  };
  visit(root);
  return chains;
}

function parseExpression(expr: TemplateExpression): AstNode | null {
  const source = expr.kind === "paren" ? `(${expr.body}\n)` : `(function(){${expr.body}\n})`;
  try {
    return parseJs(source, { ecmaVersion: "latest" }) as unknown as AstNode;
  } catch {
    // Not valid JavaScript; nothing to resolve.
    return null;
  }
}

// --------------------------------------------------------------------------
// Resolving chains
// --------------------------------------------------------------------------

const PRIMITIVE_PROTOTYPES: Record<"string" | "number" | "boolean", object> = {
  string: String.prototype,
  number: Number.prototype,
  boolean: Boolean.prototype,
};

function render(chain: readonly Segment[]): string {
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
function resolveChain(
  chain: readonly Segment[],
  inputs: ReadonlyMap<string, RuntimeShape>,
): string | null {
  const root = chain[0];
  // Unknown roots are reported by the undeclared input check.
  let current = root === null ? undefined : inputs.get(root);
  if (!current) return null;
  for (let i = 1; i < chain.length; i++) {
    const seg = chain[i];
    const path = render(chain.slice(0, i + 1));
    switch (current.kind) {
      case "unknown":
        return null;
      case "object": {
        if (seg === null) return null;
        const next = current.fields.get(seg);
        if (next) {
          current = next;
          continue;
        }
        if (seg in Object.prototype) return null;
        const elements = current.fields.get("elements");
        const hint =
          elements?.kind === "keyed" && elements.keys.includes(seg)
            ? ` Use ${render([...chain.slice(0, i), "elements", seg])}.`
            : "";
        return `${path}: ${current.description} has no field '${seg}' at job runtime (fields: ${fieldList(current.fields.keys())}).${hint}`;
      }
      case "array":
        if (seg === null || /^\d+$/.test(seg)) {
          current = current.element;
          continue;
        }
        if (seg in Array.prototype) return null;
        return `${path}: ${current.description} is an array at job runtime and has no field '${seg}'.`;
      case "keyed":
        if (seg === null || current.keys.includes(seg)) {
          current = current.value;
          continue;
        }
        if (seg in Object.prototype) return null;
        return `${path}: ${current.description} has no element '${seg}' (elements: ${fieldList(current.keys)}).`;
      default:
        if (seg === null || seg in PRIMITIVE_PROTOTYPES[current.kind]) return null;
        return `${path}: ${render(chain.slice(0, i))} is a ${current.kind} at job runtime and has no field '${seg}'.`;
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Output labels
// --------------------------------------------------------------------------

// galaxy.tool_util_models.tool_outputs.USER_TOOL_LABEL_REFERENCE_RE
const LABEL_REFERENCE_RE = /\$\((?:inputs\.(\w+)((?:\.\w+)*)|runtime\.on_string)\)/g;
const DATASET_LABEL_KEYS = ["element_identifier", "format", "name"];
const COLLECTION_LABEL_KEYS = ["element_identifier", "name"];

/** Why a label reference is never filled in, mirroring `labels._resolve`, or null when it is. */
function resolveLabelReference(
  keys: readonly string[],
  params: readonly ToolParameterModel[],
): string | null {
  let scope: readonly ToolParameterModel[] = params;
  for (let i = 0; i < keys.length; i++) {
    const param = scope.find((p) => p.name === keys[i]);
    // Root names are left to the undeclared input check; an unknown nested name is never filled in.
    if (!param) return i === 0 ? null : `there is no '${keys[i]}' in ${keys.slice(0, i).join(".")}`;
    const rest = keys.slice(i + 1);
    const kind = param.parameter_type.replace(/^gx_/, "");
    const path = keys.slice(0, i + 1).join(".");
    switch (param.parameter_type) {
      case "gx_section":
      case "gx_conditional":
        if (rest.length === 0) return `${kind} ${path} is not text; reference one of its inputs`;
        scope =
          param.parameter_type === "gx_section"
            ? param.parameters
            : [param.test_parameter, ...param.whens.flatMap((w) => w.parameters)];
        continue;
      case "gx_data":
      case "gx_data_collection": {
        const allowed =
          param.parameter_type === "gx_data" ? DATASET_LABEL_KEYS : COLLECTION_LABEL_KEYS;
        if (rest.length === 1 && allowed.includes(rest[0])) return null;
        return `a ${kind} input in a label must end with one of ${allowed.join(", ")}`;
      }
      case "gx_repeat":
        return "a repeat can't be read in a label";
      default:
        return rest.length === 0 ? null : `${kind} input ${path} has no fields`;
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

function diag(path: string, message: string): UserToolSourceDiagnostic {
  return { path, message: `Value error, ${message}`, keyword: KEYWORD, params: {} };
}

function checkTemplate(
  template: unknown,
  pointer: string,
  inputs: ReadonlyMap<string, RuntimeShape>,
): UserToolSourceDiagnostic[] {
  if (typeof template !== "string") return [];
  const problems = new Set<string>();
  for (const expr of templateExpressions(template)) {
    const ast = parseExpression(expr);
    if (!ast) continue;
    for (const chain of collectChains(ast)) {
      const problem = resolveChain(chain, inputs);
      if (problem) problems.add(problem);
    }
  }
  return [...problems].map((m) => diag(pointer, m));
}

function checkLabel(
  label: unknown,
  pointer: string,
  params: readonly ToolParameterModel[],
): UserToolSourceDiagnostic[] {
  if (typeof label !== "string") return [];
  const errors: UserToolSourceDiagnostic[] = [];
  for (const m of label.matchAll(LABEL_REFERENCE_RE)) {
    if (m[1] === undefined) continue;
    const keys = [m[1], ...m[2].split(".").slice(1)];
    const problem = resolveLabelReference(keys, params);
    if (problem)
      errors.push(diag(pointer, `label reference ${m[0]} is never filled in: ${problem}`));
  }
  return errors;
}

/**
 * Report `inputs.*` member paths in `shell_command`, `configfiles[].content`
 * and output `label`s that the job's inputs won't have.
 */
export function checkInputPaths(doc: Record<string, unknown>): UserToolSourceDiagnostic[] {
  const params = parseEachInput(doc.inputs);
  const inputs = childShapes(params, null);
  const errors = checkTemplate(doc.shell_command, "/shell_command", inputs);
  if (Array.isArray(doc.configfiles)) {
    doc.configfiles.forEach((cf, idx) => {
      if (cf && typeof cf === "object") {
        const content = (cf as Record<string, unknown>).content;
        errors.push(...checkTemplate(content, `/configfiles/${idx}/content`, inputs));
      }
    });
  }
  if (Array.isArray(doc.outputs)) {
    doc.outputs.forEach((out, idx) => {
      if (out && typeof out === "object") {
        const label = (out as Record<string, unknown>).label;
        errors.push(...checkLabel(label, `/outputs/${idx}/label`, params));
      }
    });
  }
  return errors;
}

/**
 * Parse each top-level input on its own, so one the parser rejects (a YAML
 * `section`, a malformed entry the structural schema reports) leaves the others checked.
 * References to a skipped input are left alone.
 */
function parseEachInput(raw: unknown): ToolParameterModel[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((input) => {
    try {
      return parseInputs([input]);
    } catch {
      return [];
    }
  });
}
