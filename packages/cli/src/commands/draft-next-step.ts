/**
 * `gxwf draft-next-step` — pick the next step a downstream agent should
 * work on. Wraps `nextDraftStep` from @galaxy-tool-util/schema.
 *
 * Default output is JSON (the agent-loop wire format); `--output-format
 * markdown` renders a human-glance checklist. Pure pass-through — same
 * input → byte-identical output.
 *
 * Exit codes:
 *   0 — input parses + is a (possibly non-draft) workflow document
 *   2 — parse/read failure or format mismatch (native rejected)
 */
import { nextDraftStep, resolveFormat, type NextStepResult } from "@galaxy-tool-util/schema";
import { readWorkflowFile } from "./workflow-io.js";

export interface DraftNextStepOptions {
  format?: string;
  outputFormat?: "json" | "markdown" | string;
}

export async function runDraftNextStep(
  filePath: string,
  opts: DraftNextStepOptions,
): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) {
    process.exitCode = 2;
    return;
  }

  const format = resolveFormat(data, opts.format);
  if (format === "native") {
    console.error("draft-next-step requires format2 — native workflows cannot be drafts");
    process.exitCode = 2;
    return;
  }

  const result = nextDraftStep(data);
  const outputFormat = opts.outputFormat ?? "json";

  if (outputFormat === "markdown") {
    process.stdout.write(renderMarkdown(result));
  } else if (outputFormat === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error(`unknown --output-format: ${outputFormat} (expected json or markdown)`);
    process.exitCode = 2;
    return;
  }

  process.exitCode = 0;
}

function renderMarkdown(result: NextStepResult): string {
  if (!result.draft) return "_No remaining draft work._\n";
  const heading = `## Next step: \`${result.step.join(" / ")}\`\n\n`;
  const items = result.work.map((w) => `- [ ] ${w}`).join("\n");
  return heading + items + "\n";
}
