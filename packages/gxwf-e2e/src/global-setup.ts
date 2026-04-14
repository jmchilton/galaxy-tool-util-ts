import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { MONOREPO_ROOT, UI_DIST } from "./paths.js";

// Opt-in Monaco fixture. When present, build gxwf-ui with the Monaco flags set
// so Monaco specs can drive the live editor; otherwise build the default
// (Monaco-free) bundle and let Monaco specs self-skip (see src/monaco.ts).
const MONACO_FIXTURE = path.join(
  MONOREPO_ROOT,
  "packages",
  "gxwf-ui",
  "fixtures",
  "galaxy-workflows.vsix",
);

export default async function globalSetup(): Promise<void> {
  const monacoEnabled = fs.existsSync(MONACO_FIXTURE);
  // Propagate to specs via the test process env.
  if (monacoEnabled) {
    process.env.GXWF_E2E_MONACO = "1";
  }

  if (process.env.GXWF_E2E_SKIP_UI_BUILD === "1" && fs.existsSync(UI_DIST)) {
    return;
  }

  const buildEnv = { ...process.env };
  if (monacoEnabled) {
    buildEnv.VITE_GXWF_MONACO = "1";
    // VITE_GXWF_EXT_SOURCE default ("vsix:/ext/galaxy-workflows") matches the
    // stage-extension.mjs output layout — no override needed here.
    buildEnv.VITE_GXWF_EXPOSE_MONACO = "1";
  }

  execSync("pnpm --filter @galaxy-tool-util/gxwf-ui build", {
    cwd: MONOREPO_ROOT,
    stdio: "inherit",
    env: buildEnv,
  });
  if (!fs.existsSync(UI_DIST)) {
    throw new Error(`gxwf-ui build did not produce ${UI_DIST}`);
  }
}
