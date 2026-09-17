#!/usr/bin/env node

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, defaultConfig } from "../config.js";
import { createProxyContext, createProxyServer } from "../router.js";

const args = process.argv.slice(2);

let configPath: string | null = null;
let port: number | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--config" && args[i + 1]) {
    configPath = args[++i];
  } else if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[++i], 10);
  }
}

async function main() {
  let config =
    configPath && existsSync(configPath) ? await loadConfig(configPath) : defaultConfig();

  if (port !== null) {
    config = { ...config, port };
  }

  const uiDirFromEnv = process.env.GALAXY_TOOL_PROXY_UI_DIST;
  if (uiDirFromEnv && !existsSync(uiDirFromEnv)) {
    console.error(`GALAXY_TOOL_PROXY_UI_DIST points to non-existent path: ${uiDirFromEnv}`);
    process.exit(1);
  }
  const bundledUi = fileURLToPath(new URL("../../public", import.meta.url));
  const uiDir = uiDirFromEnv ?? (existsSync(bundledUi) ? bundledUi : undefined);

  const ctx = createProxyContext(config, { uiDir });
  const server = createProxyServer(ctx);

  server.listen(config.port, config.host, () => {
    console.log(`galaxy-tool-proxy listening on ${config.host}:${config.port}`);
    if (uiDir) console.log(`  UI: ${uiDir}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
