import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "@galaxy-tool-util/gxwf-web";
import { SEED_DIR, UI_DIST } from "./paths.js";

export interface TestHarness {
  baseUrl: string;
  workspaceDir: string;
  stop(): Promise<void>;
}

export function cloneWorkspace(seed: string = SEED_DIR): string {
  const dir = path.join(os.tmpdir(), `gxwf-e2e-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(seed, dir, { recursive: true });
  return dir;
}

export async function startHarness(
  options: { seed?: string; uiDir?: string } = {},
): Promise<TestHarness> {
  const workspaceDir = cloneWorkspace(options.seed);
  const uiDir = options.uiDir ?? UI_DIST;
  if (!fs.existsSync(uiDir)) {
    throw new Error(
      `UI dist not found at ${uiDir}. Run 'pnpm --filter @galaxy-tool-util/gxwf-ui build' first.`,
    );
  }
  const { server, ready } = createApp(workspaceDir, { uiDir });
  await ready;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    workspaceDir,
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    },
  };
}
