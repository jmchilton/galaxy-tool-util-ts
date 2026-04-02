#!/usr/bin/env node

import { existsSync } from "node:fs";
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

  const ctx = createProxyContext(config);
  const server = createProxyServer(ctx);

  server.listen(config.port, config.host, () => {
    console.log(`galaxy-tool-proxy listening on ${config.host}:${config.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
