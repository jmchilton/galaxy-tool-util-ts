/** Request/response models for the gxwf-web API. */

import type { SingleExportReport, ToNativeResult } from "@galaxy-tool-util/schema";

export interface ContentsModel {
  name: string;
  path: string;
  type: "file" | "directory";
  writable: boolean;
  created: string; // ISO 8601
  last_modified: string; // ISO 8601
  size: number | null;
  mimetype: string | null;
  format: "text" | "base64" | null;
  content: string | ContentsModel[] | null;
}

export interface CheckpointModel {
  id: string;
  last_modified: string; // ISO 8601
}

export interface RenameRequest {
  path: string;
}

export interface CreateRequest {
  type: "file" | "directory";
  ext?: string | null;
}

export type WorkflowSourceFormat = "native" | "format2";

export interface ExportResult {
  source_path: string;
  output_path: string;
  source_format: WorkflowSourceFormat;
  target_format: WorkflowSourceFormat;
  report: SingleExportReport | ToNativeResult;
  dry_run: boolean;
  content: string | null;
}

export interface ConvertResult extends ExportResult {
  removed_path: string;
}
