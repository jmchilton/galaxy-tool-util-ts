/**
 * Cross-field semantic checks for Format2 input parameters.
 *
 * Effect Schema validates structural shape but not cross-field constraints
 * (e.g. "column_definitions only on sample_sheet collection inputs"). These
 * checks run after structural validation and throw on violation. Mirrors
 * gxformat2/_semantic_validators.py.
 *
 * Separate from `lint.ts` (style/best-practice) and `stateful-validate.ts`
 * (runtime tool-state validation): these are structural-but-cross-field
 * Format2 rules.
 */

import { COLLECTION_INPUT_TYPES, inputTypesDeclaring } from "./input-parameter.js";

const COLUMN_NAME_RE = /^[\w\-_ ?]*$/;

// Galaxy offers `multiple` on neither.
const SCALAR_ONLY_TYPE_VALUES = new Set(["color", "directory_uri"]);
// Parameter fields valid only on the input types whose schema declares them.
const PARAMETER_FIELD_TYPE_VALUES = new Map(
  (["restrictions", "suggestions", "restrictOnConnections", "validators"] as const).map((field) => [
    field,
    inputTypesDeclaring(field),
  ]),
);

function _columnDefaultMatchesType(columnType: unknown, value: unknown): boolean {
  if (value == null) return true;
  if (columnType === "string" || columnType === "element_identifier")
    return typeof value === "string";
  if (columnType === "int")
    return typeof value === "number" && Number.isInteger(value) && typeof value !== "boolean";
  if (columnType === "float") return typeof value === "number" && typeof value !== "boolean";
  if (columnType === "boolean") return typeof value === "boolean";
  return true;
}

function validateColumnDefinition(column: unknown): void {
  if (!column || typeof column !== "object" || Array.isArray(column)) {
    throw new Error("Expected a mapping for semantic validation");
  }
  const col = column as Record<string, unknown>;
  const name = col.name;
  if (typeof name === "string" && !COLUMN_NAME_RE.test(name)) {
    throw new Error(`Sample sheet column name '${name}' contains disallowed characters`);
  }

  const columnType = col.type;
  const defaultValue = col.default_value;
  if (!_columnDefaultMatchesType(columnType, defaultValue)) {
    throw new Error(
      `Sample sheet column '${String(name)}' default_value ${JSON.stringify(defaultValue)} does not match column type ${JSON.stringify(columnType)}`,
    );
  }

  for (const field of ["restrictions", "suggestions"] as const) {
    const values = col[field];
    if (values == null || (Array.isArray(values) && values.length === 0)) continue;
    if (!Array.isArray(values)) {
      throw new Error(`Sample sheet column '${String(name)}' ${field} must be a list`);
    }
    for (const v of values) {
      if (!_columnDefaultMatchesType(columnType, v)) {
        throw new Error(
          `Sample sheet column '${String(name)}' ${field} entry ${JSON.stringify(v)} does not match column type ${JSON.stringify(columnType)}`,
        );
      }
    }
  }
}

function _typeList(typeValue: unknown): string[] {
  if (Array.isArray(typeValue)) return typeValue.map(String);
  if (typeValue == null) return [];
  return [String(typeValue)];
}

export function validateInputParameter(inputParam: unknown): void {
  if (!inputParam || typeof inputParam !== "object") return;
  const data = inputParam as Record<string, unknown>;
  const typeValues = _typeList(data.type);
  const isCollectionOnly =
    typeValues.length > 0 && typeValues.every((t) => COLLECTION_INPUT_TYPES.has(t));
  if (Array.isArray(data.type) && typeValues.some((t) => SCALAR_ONLY_TYPE_VALUES.has(t))) {
    throw new Error(`multiple values are not supported for type=${JSON.stringify(data.type)}`);
  }

  if (data.collection_type != null && typeof data.collection_type !== "string") {
    throw new Error("collection_type must be a string");
  }
  const columnDefinitions = data.column_definitions;
  if (columnDefinitions != null && !Array.isArray(columnDefinitions)) {
    throw new Error("column_definitions must be a list");
  }
  if (Array.isArray(columnDefinitions) && columnDefinitions.length > 0) {
    if (!isCollectionOnly && typeValues.length > 0) {
      throw new Error(
        `column_definitions is only valid on collection inputs, got type=${JSON.stringify(data.type)}`,
      );
    }
    const collectionType = typeof data.collection_type === "string" ? data.collection_type : "";
    if (!collectionType.startsWith("sample_sheet")) {
      throw new Error(
        `column_definitions requires collection_type starting with 'sample_sheet', got ${JSON.stringify(collectionType)}`,
      );
    }
    for (const column of columnDefinitions) {
      validateColumnDefinition(column);
    }
  }

  // Record-input fields validation (mirrors gxformat2 #216).
  const fields = data.fields;
  if (Array.isArray(fields) && fields.length > 0) {
    if (!isCollectionOnly && typeValues.length > 0) {
      throw new Error(
        `fields is only valid on collection inputs, got type=${JSON.stringify(data.type)}`,
      );
    }
    const collectionType = typeof data.collection_type === "string" ? data.collection_type : "";
    if (!collectionType.split(":").some((part) => part === "record")) {
      throw new Error(
        `fields is only valid on record-typed collection inputs, got collection_type=${JSON.stringify(data.collection_type)}`,
      );
    }
  }

  for (const [field, allowedTypes] of PARAMETER_FIELD_TYPE_VALUES) {
    const value = data[field];
    // restrictOnConnections=false is the schema default and harmless.
    if (value == null || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeValues.length > 0 && !typeValues.every((t) => allowedTypes.has(t))) {
      const allowed = [...allowedTypes].sort().join("/");
      throw new Error(
        `${field} is only valid on ${allowed} inputs, got type=${JSON.stringify(data.type)}`,
      );
    }
  }
}

/**
 * True when a step's `state`/`tool_state` field actually carries content.
 *
 * Non-empty semantics: null/undefined, an empty object, and a blank or `{}`
 * JSON string all count as unspecified — so an empty `state: {}` left by
 * conversion does not falsely conflict with a populated `tool_state`. Mirrors
 * gxformat2 `_semantic_validators._state_is_specified`.
 */
function _stateIsSpecified(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") {
    const s = value.trim();
    return s !== "" && s !== "{}";
  }
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return Boolean(value);
}

/**
 * Validate cross-field rules on a single workflow step.
 *
 * Enforces that `state` and `tool_state` are mutually exclusive (the schema doc
 * says "Only one or the other should be specified") — they are two encodings of
 * the same tool state, so carrying both is ambiguous.
 */
export function validateStep(step: Record<string, unknown>): void {
  if (_stateIsSpecified(step.state) && _stateIsSpecified(step.tool_state)) {
    throw new Error("Workflow step specifies both 'state' and 'tool_state'; only one may be set");
  }
}

/**
 * Walk a (lax or strict) GalaxyWorkflow dict and validate cross-field rules.
 * Recurses into inline subworkflows under step.run.
 */
export function validateWorkflowSemantics(workflow: unknown): void {
  if (!workflow || typeof workflow !== "object") return;
  const data = workflow as Record<string, unknown>;

  const inputs = data.inputs;
  let iterInputs: unknown[] = [];
  if (Array.isArray(inputs)) iterInputs = inputs;
  else if (inputs && typeof inputs === "object") iterInputs = Object.values(inputs);
  for (const inp of iterInputs) {
    if (typeof inp === "string") continue;
    validateInputParameter(inp);
  }

  const steps = data.steps;
  let iterSteps: unknown[] = [];
  if (Array.isArray(steps)) iterSteps = steps;
  else if (steps && typeof steps === "object") iterSteps = Object.values(steps);
  for (const step of iterSteps) {
    if (!step || typeof step !== "object") continue;
    validateStep(step as Record<string, unknown>);
    const run = (step as Record<string, unknown>).run;
    if (
      run &&
      typeof run === "object" &&
      ["GalaxyWorkflow", "GalaxyWorkflowDraft"].includes(
        String((run as Record<string, unknown>).class),
      )
    ) {
      validateWorkflowSemantics(run);
    }
  }
}
