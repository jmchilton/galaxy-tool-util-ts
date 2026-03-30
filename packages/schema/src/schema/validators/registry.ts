import type * as S from "effect/Schema";

/**
 * A function that applies a validator's constraint to an existing schema.
 * Returns a new schema with the filter applied.
 */
export type ValidatorApplier = (schema: S.Schema.Any, validator: any) => S.Schema.Any;

const registry = new Map<string, ValidatorApplier>();

export function registerValidatorType(type: string, applier: ValidatorApplier): void {
  registry.set(type, applier);
}

export function getValidatorApplier(type: string): ValidatorApplier | undefined {
  return registry.get(type);
}

export function isValidatorTypeRegistered(type: string): boolean {
  return registry.has(type);
}

export function registeredValidatorTypes(): Set<string> {
  return new Set(registry.keys());
}

/**
 * Apply a list of validators to a schema, folding left.
 * Unknown validator types are silently skipped (skip logic should have
 * already filtered tools with unregistered validators).
 */
export function applyValidators(
  schema: S.Schema.Any,
  validators: { type: string }[],
): S.Schema.Any {
  let result = schema;
  for (const v of validators) {
    const applier = registry.get(v.type);
    if (applier) {
      result = applier(result, v);
    }
  }
  return result;
}
