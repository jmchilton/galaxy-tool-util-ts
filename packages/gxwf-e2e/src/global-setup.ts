import { execSync } from "node:child_process";
import * as fs from "node:fs";
import { MONOREPO_ROOT, UI_DIST } from "./paths.js";

export default async function globalSetup(): Promise<void> {
  if (process.env.GXWF_E2E_SKIP_UI_BUILD === "1" && fs.existsSync(UI_DIST)) {
    return;
  }
  execSync("pnpm --filter @galaxy-tool-util/gxwf-ui build", {
    cwd: MONOREPO_ROOT,
    stdio: "inherit",
  });
  if (!fs.existsSync(UI_DIST)) {
    throw new Error(`gxwf-ui build did not produce ${UI_DIST}`);
  }
}
