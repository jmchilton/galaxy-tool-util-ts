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

const COLUMN_NAME_RE = /^[\w\-_ ?]*$/;

const TEXT_TYPE_VALUES = new Set(["text", "string"]);
const COLLECTION_TYPE_VALUES = new Set(["collection", "data_collection", "data_collection_input"]);

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
  if (!column || typeof column !== "object") return;
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
    if (!Array.isArray(values)) continue;
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

function validateInputParameter(inputParam: unknown): void {
  if (!inputParam || typeof inputParam !== "object") return;
  const data = inputParam as Record<string, unknown>;
  const typeValues = _typeList(data.type);
  const isTextOnly = typeValues.length > 0 && typeValues.every((t) => TEXT_TYPE_VALUES.has(t));
  const isCollectionOnly =
    typeValues.length > 0 && typeValues.every((t) => COLLECTION_TYPE_VALUES.has(t));

  const columnDefinitions = data.column_definitions;
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

  for (const field of ["restrictions", "suggestions", "restrictOnConnections"] as const) {
    const value = data[field];
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value === false) continue;
    if (typeValues.length > 0 && !isTextOnly) {
      throw new Error(
        `${field} is only valid on text/string inputs, got type=${JSON.stringify(data.type)}`,
      );
    }
  }

  // Record-input fields validation (mirrors gxformat2 #216).
  const fields = data.fields;
  if (Array.isArray(fields) && fields.length > 0) {
    const collectionType = typeof data.collection_type === "string" ? data.collection_type : "";
    if (!collectionType.split(":").some((part) => part === "record")) {
      throw new Error(
        `fields is only valid on record-typed collection inputs, got collection_type=${JSON.stringify(data.collection_type)}`,
      );
    }
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
    const run = (step as Record<string, unknown>).run;
    if (
      run &&
      typeof run === "object" &&
      (run as Record<string, unknown>).class === "GalaxyWorkflow"
    ) {
      validateWorkflowSemantics(run);
    }
  }
}
