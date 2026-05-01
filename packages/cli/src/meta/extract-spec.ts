/**
 * Browser-safe derivation of the parsed `CliProgramSpec` view from a
 * `ProgramSpec`. Replicates commander's flag-string parsing without
 * importing commander, so the `meta` subpath stays node-free.
 *
 * Kept in sync with `meta-build.ts` (the commander-walking variant) by
 * the spec parity test — both must produce identical output for any
 * spec covered by the live in-code program.
 */
import type {
  CliCommandSpec,
  CliOptionSpec,
  CliPositionalArgSpec,
  CliProgramSpec,
} from "./types.js";
import type { ProgramSpec, SpecArg, SpecCommand, SpecOption } from "./spec-types.js";

export function extractProgramFromSpec(spec: ProgramSpec): CliProgramSpec {
  const groups = spec.optionGroups ?? {};
  return {
    name: spec.name,
    description: spec.description,
    version: spec.version,
    commands: spec.commands.map((c) => extractCommand(c, spec.name, groups)),
  };
}

function extractCommand(
  cmd: SpecCommand,
  parentPath: string,
  groups: Record<string, SpecOption[]>,
): CliCommandSpec {
  const fullName = `${parentPath} ${cmd.name}`.trim();
  const args = (cmd.args ?? []).map(extractArg);
  const options = [
    ...(cmd.options ?? []).map(extractOption),
    ...(cmd.optionGroups ?? []).flatMap((g) => (groups[g] ?? []).map(extractOption)),
  ];
  return {
    name: cmd.name,
    fullName,
    description: cmd.description,
    synopsis: `${fullName} ${synopsisSuffix(args, options)}`.trim(),
    args,
    options,
    commands: [],
  };
}

function extractArg(arg: SpecArg): CliPositionalArgSpec {
  // Match commander's `Argument(name)` parser: strips `<>`/`[]` and trailing `...`.
  const raw = arg.raw;
  const inner = raw.replace(/^[<[]|[>\]]$/g, "");
  const variadic = inner.endsWith("...");
  const name = (variadic ? inner.slice(0, -3) : inner).trim();
  const required = raw.startsWith("<");
  return {
    raw: name,
    name,
    required,
    variadic,
    description: arg.description ?? undefined,
  };
}

function extractOption(opt: SpecOption): CliOptionSpec {
  const flags = opt.flags;
  const tokens = flags.split(/[ ,|]+/).filter(Boolean);
  const short = tokens.find((t) => /^-[^-]/.test(t));
  const long = tokens.find((t) => t.startsWith("--"));
  const placeholder = matchPlaceholder(flags);
  const negatable = long?.startsWith("--no-") ?? false;
  return {
    flags,
    name: attributeNameFromFlags(flags),
    short: short || undefined,
    description: opt.description,
    takesArgument: placeholder !== undefined,
    argumentPlaceholder: placeholder,
    optionalArgument: placeholder?.startsWith("[") ?? false,
    negatable,
    defaultValue: opt.default,
  };
}

function matchPlaceholder(flags: string): string | undefined {
  const m = flags.match(/[<[][^>\]]+[>\]]/);
  return m ? m[0] : undefined;
}

/**
 * Replicates commander's `Option.attributeName()`: takes the long flag
 * (or short if no long), strips `--no-`, camelCases.
 */
function attributeNameFromFlags(flags: string): string {
  const tokens = flags.split(/[ ,|]+/).filter(Boolean);
  const long = tokens.find((t) => t.startsWith("--"));
  const base = long ?? tokens.find((t) => t.startsWith("-")) ?? flags;
  const stripped = base.replace(/^--(no-)?/, "").replace(/^-/, "");
  return stripped.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * Reproduces commander's `Command.usage()` for the leaf-command shape
 * used here: `[options] <required> [optional]`.
 */
function synopsisSuffix(args: CliPositionalArgSpec[], options: CliOptionSpec[]): string {
  const parts: string[] = [];
  if (options.length > 0) parts.push("[options]");
  for (const a of args) {
    const inner = a.variadic ? `${a.name}...` : a.name;
    parts.push(a.required ? `<${inner}>` : `[${inner}]`);
  }
  return parts.join(" ");
}
