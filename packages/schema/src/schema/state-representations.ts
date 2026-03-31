export const STATE_REPRESENTATIONS = [
  "request",
  "relaxed_request",
  "request_internal",
  "request_internal_dereferenced",
  "landing_request",
  "landing_request_internal",
  "job_internal",
  "job_runtime",
  "test_case_xml",
  "test_case_json",
  "workflow_step",
  "workflow_step_linked",
  "workflow_step_native",
] as const;

export type StateRepresentation = (typeof STATE_REPRESENTATIONS)[number];

export function requiresAllFields(rep: StateRepresentation): boolean {
  return rep === "job_internal" || rep === "job_runtime";
}

export function allowsAbsent(rep: StateRepresentation): boolean {
  return !requiresAllFields(rep);
}

export function allowsBatching(rep: StateRepresentation): boolean {
  return (
    rep === "request" ||
    rep === "relaxed_request" ||
    rep === "request_internal" ||
    rep === "request_internal_dereferenced" ||
    rep === "landing_request" ||
    rep === "landing_request_internal"
  );
}

export function usesStringIds(rep: StateRepresentation): boolean {
  return rep === "request" || rep === "relaxed_request" || rep === "landing_request";
}

export function usesIntIds(rep: StateRepresentation): boolean {
  return (
    rep === "request_internal" ||
    rep === "request_internal_dereferenced" ||
    rep === "landing_request_internal" ||
    rep === "job_internal"
  );
}

export function allowsConnectedValue(rep: StateRepresentation): boolean {
  return rep === "workflow_step_linked";
}

export function allowsConnectedOrRuntimeValue(rep: StateRepresentation): boolean {
  return rep === "workflow_step_native";
}

export function allOptional(rep: StateRepresentation): boolean {
  return rep === "landing_request" || rep === "landing_request_internal";
}

export function isWorkflowStep(rep: StateRepresentation): boolean {
  return rep === "workflow_step" || rep === "workflow_step_linked" || rep === "workflow_step_native";
}

export function isTestCase(rep: StateRepresentation): boolean {
  return rep === "test_case_xml" || rep === "test_case_json";
}

export function allowsUrlSources(rep: StateRepresentation): boolean {
  return (
    rep === "request" ||
    rep === "relaxed_request" ||
    rep === "request_internal" ||
    rep === "landing_request" ||
    rep === "landing_request_internal"
  );
}
