#!/usr/bin/env node

import { existsSync } from "node:fs";
import { createApp } from "../app.js";

const args = process.argv.slice(2);

let directory: string | null = null;
let host = "127.0.0.1";
let port = 8000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--host" && args[i + 1]) {
    host = args[++i];
  } else if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[++i], 10);
  } else if (!args[i].startsWith("--")) {
    directory = args[i];
  }
}

if (!directory) {
  console.error("Usage: gxwf-web <directory> [--host 127.0.0.1] [--port 8000]");
  process.exit(1);
}

if (!existsSync(directory)) {
  console.error(`Directory does not exist: ${directory}`);
  process.exit(1);
}

const { server } = createApp(directory);

server.listen(port, host, () => {
  console.log(`gxwf-web listening on ${host}:${port}`);
  console.log(`Serving workflows from: ${directory}`);
});
