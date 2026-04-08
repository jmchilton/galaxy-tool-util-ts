import { ref } from "vue";
import { useApi } from "./useApi";
import type { components } from "@galaxy-tool-util/gxwf-client";

type WorkflowEntry = components["schemas"]["WorkflowEntry"];

// Intentional module-level singleton: workflow state is shared across all
// components that call useWorkflows(), acting as a lightweight global store.
const workflows = ref<WorkflowEntry[]>([]);
const directory = ref<string>("");
const loading = ref(false);
const error = ref<string | null>(null);
const selected = ref<WorkflowEntry | null>(null);

export function useWorkflows() {
  const client = useApi();

  async function fetchWorkflows() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await client.GET("/workflows", {});
      if (err) {
        error.value = "Failed to load workflows";
      } else if (data) {
        workflows.value = data.workflows;
        directory.value = data.directory;
      }
    } finally {
      loading.value = false;
    }
  }

  async function refreshWorkflows() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await client.POST("/workflows/refresh", {});
      if (err) {
        error.value = "Failed to refresh workflows";
      } else if (data) {
        workflows.value = data.workflows;
        directory.value = data.directory;
      }
    } finally {
      loading.value = false;
    }
  }

  function selectWorkflow(workflow: WorkflowEntry | null) {
    selected.value = workflow;
  }

  return {
    workflows,
    directory,
    loading,
    error,
    selected,
    fetchWorkflows,
    refreshWorkflows,
    selectWorkflow,
  };
}
