import type { ParsedTool } from "@galaxy-tool-util/schema";

export interface GetToolInfo {
  getToolInfo(toolId: string, toolVersion?: string | null): ParsedTool | undefined;
}
