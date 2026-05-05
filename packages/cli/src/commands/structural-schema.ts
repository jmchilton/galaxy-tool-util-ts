/**
 * `gxwf structural-schema` — export the structural JSON Schema
 * for Galaxy workflow validation (gxformat2 or native).
 */
import { GalaxyWorkflowSchema, NativeGalaxyWorkflowSchema } from "@galaxy-tool-util/schema";
import * as JSONSchema from "effect/JSONSchema";
import { writeWorkflowOutput } from "./workflow-io.js";

export interface StructuralSchemaOptions {
  format?: string;
  output?: string;
}

export async function runStructuralSchema(opts: StructuralSchemaOptions): Promise<void> {
  const format = opts.format ?? "format2";
  if (format !== "format2" && format !== "native") {
    console.error(`Unknown format: ${format}. Use 'format2' (default) or 'native'.`);
    process.exitCode = 1;
    return;
  }

  let jsonSchema: unknown;
  try {
    jsonSchema =
      format === "native"
        ? JSONSchema.make(NativeGalaxyWorkflowSchema)
        : JSONSchema.make(GalaxyWorkflowSchema);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`JSON Schema generation failed: ${msg}`);
    process.exitCode = 1;
    return;
  }

  const output = JSON.stringify(jsonSchema, null, 2) + "\n";
  await writeWorkflowOutput(output, opts.output, "Structural schema");
}
