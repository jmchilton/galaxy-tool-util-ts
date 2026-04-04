/**
 * Shared test harness for CLI command tests.
 * Creates a temp dir + console spies, tears down on cleanup.
 */
import { vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CliTestContext {
  tmpDir: string;
  logSpy: ReturnType<typeof vi.spyOn>;
  errSpy: ReturnType<typeof vi.spyOn>;
  warnSpy: ReturnType<typeof vi.spyOn>;
  stdoutSpy: ReturnType<typeof vi.spyOn>;
  cleanup: () => Promise<void>;
}

export async function createCliTestContext(prefix: string): Promise<CliTestContext> {
  const tmpDir = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  process.exitCode = undefined;

  return {
    tmpDir,
    logSpy,
    errSpy,
    warnSpy,
    stdoutSpy,
    async cleanup() {
      await rm(tmpDir, { recursive: true });
      logSpy.mockRestore();
      errSpy.mockRestore();
      warnSpy.mockRestore();
      stdoutSpy.mockRestore();
      process.exitCode = undefined;
    },
  };
}
