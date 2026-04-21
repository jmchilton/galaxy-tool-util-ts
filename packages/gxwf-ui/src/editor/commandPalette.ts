// Open the workbench command palette. Wraps ICommandService.executeCommand so
// UI surfaces (toolbar button, future menu items) share one entry point.
//
// `editor.action.quickCommand` is NOT an editor-level action under
// monaco-vscode-api — the palette is owned by the workbench and only the
// `workbench.action.showCommands` command (registered by
// monaco-vscode-quickaccess-service-override) actually opens it. Keyboard F1
// and Ctrl+Shift+P route through the KeybindingsRegistry to that same command.

import { getService, ICommandService } from "@codingame/monaco-vscode-api/services";

const SHOW_COMMANDS_ID = "workbench.action.showCommands";

export async function showCommandPalette(): Promise<void> {
  const commandService = await getService(ICommandService);
  await commandService.executeCommand(SHOW_COMMANDS_ID);
}
