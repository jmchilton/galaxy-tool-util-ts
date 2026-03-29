import * as S from "@effect/schema/Schema";
import type { DirectoryUriParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import { safeFieldName, computeIsOptional, type DynamicSchemaInfo } from "./base.js";
import { registerParameterType } from "./registry.js";
import { applyValidators } from "../validators/registry.js";

function generateDirectoryUriSchema(
  param: unknown,
  stateRep: StateRepresentation,
): DynamicSchemaInfo {
  const p = param as DirectoryUriParameterModel;
  const { name, alias } = safeFieldName(p.name);

  // Must start with a recognized URI scheme (gxfiles://, gximport://, etc.)
  let schema: S.Schema.Any = S.String.pipe(
    S.filter((s: string) => /^gx[a-z]+:\/\//.test(s)),
  );

  schema = applyValidators(schema, p.validators);

  if (p.optional) {
    schema = S.NullOr(schema);
  }

  const requestRequiresValue = !p.optional && p.value === null;
  const isOptional = computeIsOptional(stateRep, requestRequiresValue);

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_directory_uri", generateDirectoryUriSchema);
