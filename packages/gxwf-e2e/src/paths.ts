import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const E2E_ROOT = path.resolve(__dirname, "..");
export const MONOREPO_ROOT = path.resolve(E2E_ROOT, "..", "..");
export const UI_DIST = path.join(MONOREPO_ROOT, "packages", "gxwf-ui", "dist");
export const SEED_DIR = path.join(E2E_ROOT, "fixtures", "workspace-seed");
