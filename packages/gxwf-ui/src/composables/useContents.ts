import { ref } from "vue";
import { useApi } from "./useApi";
import type { components } from "@galaxy-tool-util/gxwf-client";

type ContentsModel = components["schemas"]["ContentsModel-Output"];
type ContentsModelInput = components["schemas"]["ContentsModel-Input"];
type CheckpointModel = components["schemas"]["CheckpointModel"];

export type { ContentsModel, CheckpointModel };

// Intentional module-level singleton: contents state is shared across all
// components that call useContents(), acting as a lightweight global store.
const root = ref<ContentsModel | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

export function useContents() {
  const client = useApi();

  async function fetchRoot() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await client.GET("/api/contents", {});
      if (err) {
        error.value = "Failed to load contents";
      } else {
        root.value = data ?? null;
      }
    } finally {
      loading.value = false;
    }
  }

  async function fetchPath(path: string): Promise<ContentsModel | undefined> {
    const { data, error: err } = await client.GET("/api/contents/{path}", {
      params: { path: { path } },
    });
    if (err) throw new Error(`Failed to load path: ${path}`);
    return data;
  }

  /**
   * Save new text content to a file. Passes If-Unmodified-Since for conflict
   * detection — the server returns 409 if the file was modified since `model`
   * was fetched. Returns the updated ContentsModel on success.
   */
  async function writeFile(
    path: string,
    newContent: string,
    model: ContentsModel,
  ): Promise<ContentsModel> {
    const body: ContentsModelInput = {
      name: model.name,
      path: model.path,
      type: model.type as "file" | "directory",
      writable: model.writable,
      created: model.created,
      last_modified: model.last_modified,
      size: null,
      mimetype: model.mimetype ?? null,
      format: "text",
      content: newContent,
    };
    const { data, error: err } = await client.PUT("/api/contents/{path}", {
      params: { path: { path } },
      headers: { "If-Unmodified-Since": model.last_modified },
      body,
    });
    if (err || !data) {
      throw new Error(
        (err as { status?: number } | undefined)?.status === 409
          ? "Conflict: file was modified externally. Re-open to get the latest version."
          : "Failed to save file",
      );
    }
    return data;
  }

  /** Create a checkpoint snapshot before saving; returns the checkpoint for later undo. */
  async function createCheckpoint(path: string): Promise<CheckpointModel> {
    const { data, error: err } = await client.POST("/api/contents/{path}/checkpoints", {
      params: { path: { path } },
    });
    if (err || !data) throw new Error("Failed to create checkpoint");
    return data;
  }

  /** Restore the file from a previously created checkpoint. */
  async function restoreCheckpoint(path: string, checkpointId: string): Promise<void> {
    const { error: err } = await client.POST("/api/contents/{path}/checkpoints/{checkpoint_id}", {
      params: { path: { path, checkpoint_id: checkpointId } },
    });
    if (err) throw new Error("Failed to restore checkpoint");
  }

  return {
    root,
    loading,
    error,
    fetchRoot,
    fetchPath,
    writeFile,
    createCheckpoint,
    restoreCheckpoint,
  };
}
