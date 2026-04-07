#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import {
  loadWorkflowToolConfig,
  toolInfoOptionsFromConfig,
  type ToolSource,
} from "@galaxy-tool-util/core";
import { createApp } from "../app.js";

const args = process.argv.slice(2);

let directory: string | null = null;
let host = "127.0.0.1";
let port = 8000;
let cacheDir: string | undefined;
let configPath: string | undefined;
let outputSchema = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--host" && args[i + 1]) {
    host = args[++i];
  } else if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[++i], 10);
  } else if (args[i] === "--cache-dir" && args[i + 1]) {
    cacheDir = args[++i];
  } else if (args[i] === "--config" && args[i + 1]) {
    configPath = args[++i];
  } else if (args[i] === "--output-schema") {
    outputSchema = true;
  } else if (!args[i].startsWith("--")) {
    directory = args[i];
  }
}

if (outputSchema) {
  // openapi.json lives at <package-root>/openapi.json — two levels above dist/bin/
  const specPath = new URL("../../openapi.json", import.meta.url);
  process.stdout.write(readFileSync(specPath));
  process.exit(0);
}

if (!directory) {
  console.error(
    "Usage: gxwf-web <directory> [--host 127.0.0.1] [--port 8000] [--cache-dir <path>] [--config <path>] [--output-schema]",
  );
  process.exit(1);
}

if (!existsSync(directory)) {
  console.error(`Directory does not exist: ${directory}`);
  process.exit(1);
}

async function main() {
  let sources: ToolSource[] | undefined;

  if (configPath) {
    if (!existsSync(configPath)) {
      console.error(`Config file not found: ${configPath}`);
      process.exit(1);
    }
    const config = await loadWorkflowToolConfig(configPath);
    const toolOpts = toolInfoOptionsFromConfig(config);
    sources = toolOpts.sources;
    // --cache-dir CLI flag takes precedence over config file
    cacheDir ??= toolOpts.cacheDir;
  }

  const { server, ready } = createApp(directory!, { cacheDir, sources });

  server.listen(port, host, () => {
    console.log(`gxwf-web listening on ${host}:${port}`);
    console.log(`Serving workflows from: ${directory}`);
    if (configPath) console.log(`Config: ${configPath}`);
  });

  void ready.then(() => {
    console.log("Tool cache loaded, workflows discovered.");
  });
}

main().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
