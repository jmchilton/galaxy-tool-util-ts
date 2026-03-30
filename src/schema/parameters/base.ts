import * as S from "@effect/schema/Schema";
import type { ToolParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { requiresAllFields, allOptional } from "../state-representations.js";

/**
 * Analogous to Python's DynamicModelInformation.
 * Carries the Effect Schema property spec for a single parameter field.
 */
export interface DynamicSchemaInfo {
  /** The field name in the generated struct (safe-escaped if needed) */
  name: string;
  /** The original parameter name (used as alias if name differs) */
  alias?: string;
  /** The Effect Schema for this field's value */
  schema: S.Schema.Any;
  /** Whether the field is optional (can be absent from the object) */
  isOptional: boolean;
  /** If true, generator already handled ConnectedValue wrapping — skip central wrapping */
  connectedValueHandled?: boolean;
}

/**
 * Context passed to generators, enabling container types to recurse
 * into child parameters without circular imports on model-factory.
 */
export interface GeneratorContext {
  buildChildSchema(
    params: ToolParameterModel[],
    stateRep: StateRepresentation,
  ): S.Schema.Any | undefined;
  buildChildSchemaInfos(
    params: ToolParameterModel[],
    stateRep: StateRepresentation,
  ): DynamicSchemaInfo[] | undefined;
  assembleStruct(infos: DynamicSchemaInfo[]): S.Schema.Any;
}

/**
 * A function that generates schema info for a parameter given a state representation.
 */
export type ParameterSchemaGenerator = (
  param: ToolParameterModel,
  stateRep: StateRepresentation,
  ctx: GeneratorContext,
) => DynamicSchemaInfo;

/**
 * Escape parameter names starting with '_' — mirrors Python's safe_field_name.
 * Parameters starting with '_' get 'X' prefix with the original name as alias.
 */
export function safeFieldName(name: string): { name: string; alias?: string } {
  if (name.startsWith("_")) {
    return { name: `X${name}`, alias: name };
  }
  return { name };
}

/**
 * Determine if a field can be absent from the object for a given state representation.
 * Mirrors the Python logic spread across pydantic_template() methods.
 *
 * @param stateRep - the state representation being generated
 * @param requestRequiresValue - whether this param requires a value in request context.
 *   For gx_integer: `!optional && value === null`
 *   For gx_text: always false (text fields always have a default)
 *   For gx_boolean: always false (boolean fields always have a default)
 */
export function computeIsOptional(
  stateRep: StateRepresentation,
  requestRequiresValue: boolean,
): boolean {
  if (requiresAllFields(stateRep)) {
    // job_internal, job_runtime: all fields required
    return false;
  }
  if (allOptional(stateRep)) {
    // landing_request, landing_request_internal: all fields optional
    return true;
  }
  // request and friends: required only if requestRequiresValue
  return !requestRequiresValue;
}
