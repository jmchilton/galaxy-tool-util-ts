/** Workflow format — native (.ga) or format2 (.gxwf.yml). */
export type WorkflowFormat = "native" | "format2";

/** Detect whether a workflow dict is native or format2. */
export function detectFormat(data: Record<string, unknown>): WorkflowFormat {
  if ("a_galaxy_workflow" in data) return "native";
  if (data.class === "GalaxyWorkflow") return "format2";
  if ("format-version" in data) return "native";
  return "format2";
}
