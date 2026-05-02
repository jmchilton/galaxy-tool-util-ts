/**
 * `gxwf mermaid` — render a Galaxy workflow as a Mermaid flowchart diagram.
 */
import { workflowToMermaid } from "@galaxy-tool-util/schema";
import { writeFile } from "node:fs/promises";
import { readWorkflowFile } from "./workflow-io.js";
import { resolveEdgeAnnotations } from "./annotate-connections.js";

export interface MermaidCommandOptions {
  output?: string;
  comments?: boolean;
  annotateConnections?: boolean;
  cacheDir?: string;
}

export async function runMermaid(filePath: string, opts: MermaidCommandOptions): Promise<void> {
  const data = await readWorkflowFile(filePath);
  if (!data) return;

  const edgeAnnotations = opts.annotateConnections
    ? await resolveEdgeAnnotations(data, { cacheDir: opts.cacheDir })
    : undefined;

  const diagram = workflowToMermaid(data, { comments: opts.comments, edgeAnnotations });

  if (!opts.output) {
    process.stdout.write(diagram + "\n");
    return;
  }

  const content = opts.output.endsWith(".md")
    ? `\`\`\`mermaid\n${diagram}\n\`\`\`\n`
    : diagram + "\n";
  await writeFile(opts.output, content, "utf-8");
  console.error(`Mermaid diagram written to ${opts.output}`);
}
