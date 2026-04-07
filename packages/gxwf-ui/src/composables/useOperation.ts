import { computed, reactive } from "vue";
import { useApi } from "./useApi";
import type {
  SingleValidationReport,
  SingleLintReport,
  SingleCleanReport,
  SingleRoundTripReport,
} from "@galaxy-tool-util/schema";

export type OperationName = "validate" | "lint" | "clean" | "roundtrip";

interface OperationResults {
  validate: SingleValidationReport | null;
  lint: SingleLintReport | null;
  clean: SingleCleanReport | null;
  roundtrip: SingleRoundTripReport | null;
}

interface OperationState {
  results: Partial<OperationResults>;
  loading: Partial<Record<OperationName, boolean>>;
  error: Partial<Record<OperationName, string | null>>;
}

// Intentional module-level singleton: operation results are cached across
// all components (WorkflowView, WorkflowList badges) without re-fetching.
// Exported so WorkflowList can build a reactive computed map over all paths.
export const opCache = reactive<Record<string, OperationState>>({});

function ensureState(path: string): OperationState {
  if (!opCache[path]) {
    opCache[path] = { results: {}, loading: {}, error: {} };
  }
  return opCache[path];
}

/**
 * Returns the worst status across all cached results for a workflow path.
 * Returns "fail" if any result indicates failure, "ok" if all that ran passed,
 * null if nothing has been run yet (clean-only runs are informational, not pass/fail).
 */
export function getLastRunStatus(workflowPath: string): "ok" | "fail" | null {
  const state = opCache[workflowPath];
  if (!state) return null;

  let anyRun = false;
  let anyFail = false;

  const vr = state.results.validate;
  if (vr != null) {
    anyRun = true;
    if (vr.results.some((r) => r.status === "fail")) anyFail = true;
  }
  const lr = state.results.lint;
  if (lr != null) {
    anyRun = true;
    if (lr.lint_errors > 0) anyFail = true;
  }
  const rr = state.results.roundtrip;
  if (rr != null) {
    anyRun = true;
    if (!rr.result.ok) anyFail = true;
  }
  // clean alone doesn't indicate pass/fail
  if (!anyRun) return null;
  return anyFail ? "fail" : "ok";
}

/** Drop all cached results for a workflow path (e.g. after the file is saved). */
export function clearOpCache(workflowPath: string) {
  delete opCache[workflowPath];
}

export function useOperation(workflowPath: string) {
  const client = useApi();

  const validateResult = computed(() => ensureState(workflowPath).results.validate ?? null);
  const lintResult = computed(() => ensureState(workflowPath).results.lint ?? null);
  const cleanResult = computed(() => ensureState(workflowPath).results.clean ?? null);
  const roundtripResult = computed(() => ensureState(workflowPath).results.roundtrip ?? null);

  const validateLoading = computed(() => ensureState(workflowPath).loading.validate ?? false);
  const lintLoading = computed(() => ensureState(workflowPath).loading.lint ?? false);
  const cleanLoading = computed(() => ensureState(workflowPath).loading.clean ?? false);
  const roundtripLoading = computed(() => ensureState(workflowPath).loading.roundtrip ?? false);

  const validateError = computed(() => ensureState(workflowPath).error.validate ?? null);
  const lintError = computed(() => ensureState(workflowPath).error.lint ?? null);
  const cleanError = computed(() => ensureState(workflowPath).error.clean ?? null);
  const roundtripError = computed(() => ensureState(workflowPath).error.roundtrip ?? null);

  async function runValidate() {
    const s = ensureState(workflowPath);
    s.loading.validate = true;
    s.error.validate = null;
    try {
      const { data, error } = await client.GET("/workflows/{workflow_path}/validate", {
        params: { path: { workflow_path: workflowPath } },
      });
      if (error) {
        s.error.validate = "Failed to validate workflow";
      } else {
        s.results.validate = (data as unknown as SingleValidationReport) ?? null;
      }
    } finally {
      s.loading.validate = false;
    }
  }

  async function runLint() {
    const s = ensureState(workflowPath);
    s.loading.lint = true;
    s.error.lint = null;
    try {
      const { data, error } = await client.GET("/workflows/{workflow_path}/lint", {
        params: { path: { workflow_path: workflowPath } },
      });
      if (error) {
        s.error.lint = "Failed to lint workflow";
      } else {
        s.results.lint = (data as unknown as SingleLintReport) ?? null;
      }
    } finally {
      s.loading.lint = false;
    }
  }

  async function runClean() {
    const s = ensureState(workflowPath);
    s.loading.clean = true;
    s.error.clean = null;
    try {
      const { data, error } = await client.GET("/workflows/{workflow_path}/clean", {
        params: { path: { workflow_path: workflowPath } },
      });
      if (error) {
        s.error.clean = "Failed to clean workflow";
      } else {
        s.results.clean = (data as unknown as SingleCleanReport) ?? null;
      }
    } finally {
      s.loading.clean = false;
    }
  }

  async function runRoundtrip() {
    const s = ensureState(workflowPath);
    s.loading.roundtrip = true;
    s.error.roundtrip = null;
    try {
      const { data, error } = await client.GET("/workflows/{workflow_path}/roundtrip", {
        params: { path: { workflow_path: workflowPath } },
      });
      if (error) {
        s.error.roundtrip = "Failed to run roundtrip";
      } else {
        s.results.roundtrip = (data as unknown as SingleRoundTripReport) ?? null;
      }
    } finally {
      s.loading.roundtrip = false;
    }
  }

  return {
    validateResult,
    lintResult,
    cleanResult,
    roundtripResult,
    validateLoading,
    lintLoading,
    cleanLoading,
    roundtripLoading,
    validateError,
    lintError,
    cleanError,
    roundtripError,
    runValidate,
    runLint,
    runClean,
    runRoundtrip,
  };
}
