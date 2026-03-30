import type { ParameterSchemaGenerator } from "./base.js";

/**
 * Registry mapping parameter_type strings to their schema generators.
 * Separated from index.ts to avoid circular initialization with generator modules.
 */
const registry = new Map<string, ParameterSchemaGenerator>();

export function registerParameterType(
  parameterType: string,
  generator: ParameterSchemaGenerator,
): void {
  registry.set(parameterType, generator);
}

export function getParameterGenerator(parameterType: string): ParameterSchemaGenerator | undefined {
  return registry.get(parameterType);
}

export function isParameterTypeRegistered(parameterType: string): boolean {
  return registry.has(parameterType);
}

export function registeredParameterTypes(): ReadonlySet<string> {
  return new Set(registry.keys());
}
