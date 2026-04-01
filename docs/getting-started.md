# Getting Started

## Prerequisites

- Node.js >= 22
- pnpm (for monorepo development) or npm/yarn (for consuming packages)

## Installation

Install whichever packages you need:

```bash
# CLI tool (global install)
npm install -g @galaxy-tool-util/cli

# Or as project dependencies
npm install @galaxy-tool-util/schema @galaxy-tool-util/core
```

## First Steps

### Cache a Tool

The CLI fetches tool metadata from the Galaxy ToolShed and stores it locally:

```bash
galaxy-tool-cache add toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0
```

This downloads the tool's parsed metadata (inputs, outputs, help text, etc.) and writes it to the local cache at `~/.galaxy/tool_info_cache/`.

### List Cached Tools

```bash
galaxy-tool-cache list
galaxy-tool-cache list --json
```

### Export a JSON Schema

Generate a JSON Schema describing valid parameter values for a tool at a specific state representation:

```bash
# Default representation: workflow_step
galaxy-tool-cache schema toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc --version 0.74+galaxy0

# Different representation
galaxy-tool-cache schema toolshed.g2.bx.psu.edu/repos/devteam/fastqc/fastqc \
  --version 0.74+galaxy0 \
  --representation workflow_step_linked
```

### Validate a Workflow

Validate a Galaxy workflow file's structure and optionally its tool state:

```bash
# Validate structure + tool state (auto-detects format)
galaxy-tool-cache validate-workflow my-workflow.ga

# Format2 workflow
galaxy-tool-cache validate-workflow my-workflow.gxwf.yml

# Skip tool state validation
galaxy-tool-cache validate-workflow my-workflow.ga --no-tool-state

# Use JSON Schema validation backend
galaxy-tool-cache validate-workflow my-workflow.ga --mode json-schema
```

### Run the Proxy Server

Serve tool schemas over HTTP (useful as a sidecar for the Galaxy workflow editor):

```bash
# Install
npm install -g @galaxy-tool-util/server

# Run with defaults (localhost:8080)
galaxy-tool-proxy

# Run with a config file
galaxy-tool-proxy --config proxy-config.yml
```

## Next Steps

- [Package details](packages/schema.md) for each package's API
- [Workflow Validation guide](guide/workflow-validation.md) for end-to-end validation
- [Configuration reference](guide/configuration.md) for all env vars and options
