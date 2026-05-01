/**
 * Build a commander `Command` tree from a declarative `ProgramSpec` plus
 * a name-keyed handler registry. The spec carries the static shape
 * (commands, args, options, defaults); the registry supplies the
 * runtime action functions.
 */
import { Command } from "commander";
import type { ProgramSpec, SpecCommand, SpecOption } from "../meta/spec-types.js";

export type HandlerFn = (...args: any[]) => void | Promise<void>;
export type HandlerRegistry = Record<string, HandlerFn>;

export function buildProgramFromSpec(spec: ProgramSpec, handlers: HandlerRegistry): Command {
  validateSpec(spec, handlers);
  const program = new Command();
  program.name(spec.name).description(spec.description).version(spec.version);
  const groups = spec.optionGroups ?? {};
  for (const cmd of spec.commands) {
    program.addCommand(buildCommand(cmd, groups, handlers));
  }
  return program;
}

/**
 * Cheap structural checks the YAML loader doesn't catch — duplicate
 * names, dangling refs, missing handlers. Runs before commander touches
 * the spec so errors point at the YAML, not at a confusing commander
 * stack trace.
 */
function validateSpec(spec: ProgramSpec, handlers: HandlerRegistry): void {
  const groups = spec.optionGroups ?? {};
  const seenCommands = new Set<string>();
  for (const cmd of spec.commands) {
    if (seenCommands.has(cmd.name)) {
      throw new Error(`Duplicate command "${cmd.name}" in spec "${spec.name}"`);
    }
    seenCommands.add(cmd.name);
    if (!handlers[cmd.handler]) {
      throw new Error(`Missing handler "${cmd.handler}" for command "${cmd.name}"`);
    }
    const seenOptions = new Set<string>();
    const checkOptName = (flags: string): void => {
      const optName = attributeNameFromFlags(flags);
      if (seenOptions.has(optName)) {
        throw new Error(`Duplicate option "${optName}" on command "${cmd.name}"`);
      }
      seenOptions.add(optName);
    };
    for (const opt of cmd.options ?? []) checkOptName(opt.flags);
    for (const groupName of cmd.optionGroups ?? []) {
      const group = groups[groupName];
      if (!group) {
        throw new Error(`Command "${cmd.name}" references unknown optionGroup "${groupName}"`);
      }
      for (const opt of group) checkOptName(opt.flags);
    }
  }
}

/**
 * Extract the option's attributeName the same way commander does — the
 * first long flag, stripped of `--no-` prefix and camelCased. Used only
 * for duplicate detection here; commander itself owns the canonical
 * derivation at runtime.
 */
function attributeNameFromFlags(flags: string): string {
  const long = flags.split(/[ ,|]+/).find((part) => part.startsWith("--"));
  if (!long) return flags;
  const stripped = long.replace(/^--(no-)?/, "");
  return stripped.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

function buildCommand(
  spec: SpecCommand,
  groups: Record<string, SpecOption[]>,
  handlers: HandlerRegistry,
): Command {
  const cmd = new Command(spec.name).description(spec.description);
  for (const arg of spec.args ?? []) {
    if (arg.description !== undefined) cmd.argument(arg.raw, arg.description);
    else cmd.argument(arg.raw);
  }
  for (const opt of spec.options ?? []) {
    addOption(cmd, opt);
  }
  for (const groupName of spec.optionGroups ?? []) {
    const group = groups[groupName];
    if (!group) {
      throw new Error(`Command "${spec.name}" references unknown optionGroup "${groupName}"`);
    }
    for (const opt of group) addOption(cmd, opt);
  }
  const handler = handlers[spec.handler];
  if (!handler) {
    throw new Error(`Missing handler "${spec.handler}" for command "${spec.name}"`);
  }
  cmd.action(handler);
  return cmd;
}

function addOption(cmd: Command, opt: SpecOption): void {
  if (opt.default !== undefined) {
    cmd.option(opt.flags, opt.description, String(opt.default));
  } else {
    cmd.option(opt.flags, opt.description);
  }
}
