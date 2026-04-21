import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake CommandsRegistry modelling the real contract: registerCommand returns a
// disposable; later registrations for the same id win; dispose restores the
// previous handler. That's enough to verify our override semantics without
// booting monaco-vscode-api.
type Handler = (...args: unknown[]) => unknown;
const stacks = new Map<string, Handler[]>();

vi.mock("@codingame/monaco-vscode-api/monaco", () => ({
  CommandsRegistry: {
    registerCommand(id: string, handler: Handler) {
      const stack = stacks.get(id) ?? [];
      stack.push(handler);
      stacks.set(id, stack);
      return {
        dispose() {
          const s = stacks.get(id);
          if (!s) return;
          const idx = s.lastIndexOf(handler);
          if (idx >= 0) s.splice(idx, 1);
        },
      };
    },
    getTop(id: string): Handler | undefined {
      const s = stacks.get(id);
      return s && s[s.length - 1];
    },
  },
}));

import { CommandsRegistry } from "@codingame/monaco-vscode-api/monaco";
import { registerGxwfSaveHandler, SAVE_COMMAND_ID } from "../../src/editor/saveCommand";

// Cast back to the test-local shape so we can inspect the top of the stack.
const Registry = CommandsRegistry as unknown as { getTop: (id: string) => Handler | undefined };

function invokeTop(id: string): unknown {
  const top = Registry.getTop(id);
  if (!top) throw new Error(`no handler registered for ${id}`);
  return top({} as never);
}

describe("registerGxwfSaveHandler", () => {
  beforeEach(() => {
    stacks.clear();
  });

  it("registers under workbench.action.files.save", () => {
    registerGxwfSaveHandler(() => {});
    expect(Registry.getTop(SAVE_COMMAND_ID)).toBeDefined();
  });

  it("invokes the supplied handler when the command fires", async () => {
    const handler = vi.fn();
    registerGxwfSaveHandler(handler);
    invokeTop(SAVE_COMMAND_ID);
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("tolerates an async handler (fire-and-forget)", async () => {
    let resolved = false;
    registerGxwfSaveHandler(async () => {
      await new Promise((r) => setTimeout(r, 0));
      resolved = true;
    });
    invokeTop(SAVE_COMMAND_ID);
    await new Promise((r) => setTimeout(r, 5));
    expect(resolved).toBe(true);
  });

  it("dispose restores the previous handler", () => {
    const prior = vi.fn();
    CommandsRegistry.registerCommand(SAVE_COMMAND_ID, prior);
    const reg = registerGxwfSaveHandler(() => {});
    reg.dispose();
    expect(Registry.getTop(SAVE_COMMAND_ID)).toBe(prior);
  });

  it("later registration shadows an earlier one", async () => {
    const first = vi.fn();
    const second = vi.fn();
    registerGxwfSaveHandler(first);
    registerGxwfSaveHandler(second);
    invokeTop(SAVE_COMMAND_ID);
    await Promise.resolve();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
