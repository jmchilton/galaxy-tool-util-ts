// Override the workbench `workbench.action.files.save` command so the
// built-in Ctrl+S / Cmd+S keybinding routes into gxwf-ui's save handler
// instead of Monaco's default path (which would write into our in-memory
// FileSystemProvider without ever touching the gxwf-web backend).
//
// CommandsRegistry.registerCommand stacks handlers for a given id; later
// registrations take precedence and dispose restores the prior handler.
// Register lazily (after services.initialize resolves) and hand callers a
// dispose so FileView can clean up on unmount.

import { CommandsRegistry } from "@codingame/monaco-vscode-api/monaco";

export const SAVE_COMMAND_ID = "workbench.action.files.save";

export type GxwfSaveHandler = () => Promise<void> | void;

export interface SaveHandlerRegistration {
  dispose(): void;
}

export function registerGxwfSaveHandler(handler: GxwfSaveHandler): SaveHandlerRegistration {
  // CommandsRegistry's typed return is void. We fire-and-forget the handler —
  // save progress is surfaced through FileView's `saving` ref / toolbar state,
  // so the command dispatcher doesn't need to await. Any rejection is logged.
  return CommandsRegistry.registerCommand(SAVE_COMMAND_ID, () => {
    void Promise.resolve(handler()).catch((err) => {
      console.error("[gxwf-ui] save command failed:", err);
    });
  });
}
