/**
 * Walks a Commander program and produces a `CliProgramSpec`.
 *
 * NODE-ONLY: imports `commander`. Kept as the commander-derived oracle
 * for the spec parity test, which asserts that `extractProgramFromSpec`
 * (browser-safe, in `src/meta/`) produces identical output. Lives
 * outside `src/meta/` so the published `meta` subpath stays free of
 * commander.
 */
import type { Command, Option, Argument } from "commander";
import type {
  CliCommandSpec,
  CliOptionSpec,
  CliPositionalArgSpec,
  CliProgramSpec,
} from "./meta/types.js";

export function extractProgram(program: Command): CliProgramSpec {
  return {
    name: program.name(),
    description: program.description(),
    version: program.version() ?? "",
    commands: program.commands.map((c) => extractCommand(c, program.name())),
  };
}

function extractCommand(cmd: Command, parentPath: string): CliCommandSpec {
  const name = cmd.name();
  const fullName = `${parentPath} ${name}`.trim();
  return {
    name,
    fullName,
    description: cmd.description(),
    synopsis: `${fullName} ${cmd.usage()}`.trim(),
    args: (cmd as unknown as { registeredArguments: Argument[] }).registeredArguments.map(
      extractArg,
    ),
    options: cmd.options.map(extractOption),
    commands: cmd.commands.map((c) => extractCommand(c, fullName)),
  };
}

function extractArg(arg: Argument): CliPositionalArgSpec {
  return {
    raw: arg.name(),
    name: arg.name(),
    required: arg.required,
    variadic: arg.variadic,
    description: arg.description || undefined,
  };
}

function extractOption(opt: Option): CliOptionSpec {
  const flags = opt.flags;
  const name = opt.attributeName();
  const short = opt.short || undefined;
  const placeholder = extractPlaceholder(flags);
  return {
    flags,
    name,
    short,
    description: opt.description,
    takesArgument: placeholder !== undefined,
    argumentPlaceholder: placeholder,
    optionalArgument: placeholder?.startsWith("[") ?? false,
    negatable: opt.long?.startsWith("--no-") ?? false,
    defaultValue: serializableDefault(opt.defaultValue),
  };
}

function extractPlaceholder(flags: string): string | undefined {
  const match = flags.match(/[<[][^>\]]+[>\]]/);
  return match ? match[0] : undefined;
}

function serializableDefault(value: unknown): string | number | boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
}
