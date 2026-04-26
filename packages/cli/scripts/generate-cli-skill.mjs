/**
 * Generate docs/skills/gxwf-cli/SKILL.md from commander programs.
 *
 * Walks the configured Command instances for `gxwf` and `galaxy-tool-cache`
 * and emits a single distributable skill markdown file. Re-run after CLI churn.
 *
 * Run as: node scripts/generate-cli-skill.mjs   (after `pnpm build`)
 * Wired into: `make gen-skill`
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildGxwfProgram } from "../dist/programs/gxwf.js";
import { buildGalaxyToolCacheProgram } from "../dist/programs/galaxy-tool-cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../..");
const outFile = join(repoRoot, "docs/skills/gxwf-cli/SKILL.md");

const FRONTMATTER = `---
name: gxwf-cli
description: Reference for the @galaxy-tool-util/cli binaries — gxwf (workflow validate / clean / lint / convert / roundtrip / mermaid, single-file and tree variants) and galaxy-tool-cache (tool metadata caching). Generated from commander; re-run \`make gen-skill\` after CLI churn.
---
`;

function renderArgument(arg) {
  const wrap = arg.required ? ["<", ">"] : ["[", "]"];
  const desc = arg.description ? ` — ${arg.description}` : "";
  return `\`${wrap[0]}${arg.name()}${wrap[1]}\`${desc}`;
}

function renderOption(opt) {
  const def =
    opt.defaultValue !== undefined && opt.defaultValue !== false
      ? ` (default: \`${opt.defaultValue}\`)`
      : "";
  // Escape pipe chars so they don't break the table.
  const desc = (opt.description || "").replace(/\|/g, "\\|");
  return `| \`${opt.flags}\` | ${desc}${def} |`;
}

function renderCommand(cmd, depth) {
  const args = cmd.registeredArguments.map((a) => a.name()).map((n, i) => {
    const arg = cmd.registeredArguments[i];
    const wrap = arg.required ? ["<", ">"] : ["[", "]"];
    return `${wrap[0]}${n}${wrap[1]}`;
  });
  const heading = `${"#".repeat(depth)} \`${cmd.name()}${args.length ? " " + args.join(" ") : ""}\``;

  const lines = [heading, "", cmd.description()];

  if (cmd.registeredArguments.length) {
    lines.push("", "**Arguments:**", "");
    for (const arg of cmd.registeredArguments) {
      lines.push(`- ${renderArgument(arg)}`);
    }
  }

  if (cmd.options.length) {
    lines.push("", "| Option | Description |", "|---|---|");
    for (const opt of cmd.options) {
      lines.push(renderOption(opt));
    }
  }

  lines.push("");
  return lines.join("\n");
}

function renderProgram(program, depth) {
  const lines = [
    `${"#".repeat(depth)} \`${program.name()}\``,
    "",
    program.description(),
    "",
  ];
  for (const cmd of program.commands) {
    lines.push(renderCommand(cmd, depth + 1));
  }
  return lines.join("\n");
}

const body = [
  "# galaxy-tool-util CLI reference",
  "",
  "Single-page skill covering both binaries shipped by `@galaxy-tool-util/cli`.",
  "Auto-generated from the commander program definitions — do not hand-edit.",
  "",
  renderProgram(buildGxwfProgram(), 2),
  renderProgram(buildGalaxyToolCacheProgram(), 2),
].join("\n");

await writeFile(outFile, FRONTMATTER + "\n" + body);
console.log(`wrote ${outFile}`);
