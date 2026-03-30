import * as S from "@effect/schema/Schema";
import type { DataParameterModel } from "../bundle-types.js";
import type { StateRepresentation } from "../state-representations.js";
import {
  usesStringIds,
  allowsBatching,
  allowsUrlSources,
  isWorkflowStep,
  isTestCase,
} from "../state-representations.js";
import {
  safeFieldName,
  computeIsOptional,
  type DynamicSchemaInfo,
  type GeneratorContext,
} from "./base.js";
import { registerParameterType } from "./registry.js";

function generateDataSchema(
  param: unknown,
  stateRep: StateRepresentation,
  _ctx: GeneratorContext,
): DynamicSchemaInfo {
  const p = param as DataParameterModel;
  const { name, alias } = safeFieldName(p.name);

  let schema: S.Schema.Any;

  if (isWorkflowStep(stateRep)) {
    // workflow_step: data is always absent. workflow_step_linked: ConnectedValue only (added centrally).
    schema = S.Unknown.pipe(S.filter(() => false));
  } else if (isTestCase(stateRep)) {
    // test_case: File with path or location (at least one required)
    const fileWithPath = S.Struct({ class: S.Literal("File"), path: S.String });
    const fileWithLocation = S.Struct({ class: S.Literal("File"), location: S.String });
    schema = S.Union(fileWithPath, fileWithLocation);
  } else if (stateRep === "job_runtime") {
    // job_runtime: File objects instead of source references
    const fileSchema = S.Struct({
      class: S.Literal("File"),
      basename: S.String,
      location: S.String,
      path: S.String,
      nameroot: S.String,
      nameext: S.String,
      format: S.String,
      size: S.Number,
      element_identifier: S.optional(S.String),
    });
    schema = p.multiple ? S.Array(fileSchema) : fileSchema;
  } else {
    const idSchema: S.Schema.Any = usesStringIds(stateRep) ? S.String : S.Int;

    // Direct sources
    const hdaSource = S.Struct({ src: S.Literal("hda"), id: idSchema });
    const dceSource = S.Struct({ src: S.Literal("dce"), id: idSchema });
    const urlSource = S.Struct({ src: S.Literal("url"), url: S.String, ext: S.String });

    // Batch: hdca/dce with optional map_over_type
    const hdcaBatchVal = S.Struct({
      src: S.Literal("hdca"),
      id: idSchema,
      map_over_type: S.optional(S.NullOr(S.String)),
    });
    const dceBatchVal = S.Struct({
      src: S.Literal("dce"),
      id: idSchema,
      map_over_type: S.optional(S.NullOr(S.String)),
    });
    const batchSource = S.Struct({
      __class__: S.Literal("Batch"),
      values: S.Array(S.Union(hdcaBatchVal, dceBatchVal)),
    });

    if (p.multiple) {
      // Multiple: single src obj OR array of srcs; hdca allowed directly
      const hdcaDirect = S.Struct({ src: S.Literal("hdca"), id: idSchema });
      const singleParts: S.Schema.Any[] = [hdaSource, hdcaDirect];
      if (allowsUrlSources(stateRep)) {
        singleParts.push(urlSource);
      }
      const singleSrc = S.Union(...singleParts);
      const parts: S.Schema.Any[] = [singleSrc, S.Array(singleSrc)];
      if (allowsBatching(stateRep)) {
        parts.push(batchSource);
      }
      schema = S.Union(...parts);
    } else {
      // Single: hda direct + optional dce/url/batch
      const parts: S.Schema.Any[] = [hdaSource];
      if (stateRep === "job_internal") {
        parts.push(dceSource);
      }
      if (allowsUrlSources(stateRep)) {
        parts.push(urlSource);
      }
      if (allowsBatching(stateRep)) {
        parts.push(batchSource);
      }
      schema = S.Union(...parts);
    }
  }

  if (p.optional && !isWorkflowStep(stateRep)) {
    schema = S.NullOr(schema);
  }

  // workflow_step: data always optional (absent only, no value possible)
  // Others: required unless optional
  let isOptional: boolean;
  if (stateRep === "workflow_step") {
    isOptional = true;
  } else {
    const requestRequiresValue = !p.optional;
    isOptional = computeIsOptional(stateRep, requestRequiresValue);
  }

  return { name, alias, schema, isOptional };
}

registerParameterType("gx_data", generateDataSchema);
