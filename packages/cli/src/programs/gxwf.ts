/**
 * `gxwf` commander program — built at runtime from `spec/gxwf.json`
 * plus the handler registry below. The JSON spec is the source of truth
 * for the command surface; this file just wires action functions to
 * spec entries by name.
 */
import type { Command } from "commander";
import { runClean } from "../commands/clean.js";
import { runCleanTree } from "../commands/clean-tree.js";
import { runConvert } from "../commands/convert.js";
import { runConvertTree } from "../commands/convert-tree.js";
import { runRoundtrip } from "../commands/roundtrip.js";
import { runRoundtripTree } from "../commands/roundtrip-tree.js";
import { runLint } from "../commands/lint.js";
import { runMermaid } from "../commands/mermaid.js";
import { runCytoscapeJs } from "../commands/cytoscapejs.js";
import { runLintTree } from "../commands/lint-tree.js";
import { runValidateWorkflow } from "../commands/validate-workflow.js";
import { runValidateTests } from "../commands/validate-tests.js";
import { runValidateTestsTree } from "../commands/validate-tests-tree.js";
import { runValidateTree } from "../commands/validate-tree.js";
import { runToolSearch } from "../commands/tool-search.js";
import { runToolVersions } from "../commands/tool-versions.js";
import { runToolRevisions } from "../commands/tool-revisions.js";
import { runRepoSearch } from "../commands/repo-search.js";
import { buildProgramFromSpec, type HandlerRegistry } from "../spec/build-program.js";
import { gxwfSpec } from "../meta/specs.js";

const handlers: HandlerRegistry = {
  validateWorkflow: runValidateWorkflow,
  validateTests: runValidateTests,
  clean: runClean,
  lint: runLint,
  convert: runConvert,
  roundtrip: runRoundtrip,
  mermaid: (file: string, output: string | undefined, opts: { comments?: boolean }) =>
    runMermaid(file, { output, comments: opts.comments }),
  cytoscapeJs: (
    file: string,
    output: string | undefined,
    opts: { html?: boolean; json?: boolean },
  ) => runCytoscapeJs(file, { output, html: opts.html, json: opts.json }),
  validateTree: runValidateTree,
  lintTree: runLintTree,
  cleanTree: runCleanTree,
  convertTree: runConvertTree,
  roundtripTree: runRoundtripTree,
  validateTestsTree: runValidateTestsTree,
  toolSearch: runToolSearch,
  toolVersions: runToolVersions,
  toolRevisions: runToolRevisions,
  repoSearch: runRepoSearch,
};

export function buildGxwfProgram(): Command {
  return buildProgramFromSpec(gxwfSpec, handlers);
}
