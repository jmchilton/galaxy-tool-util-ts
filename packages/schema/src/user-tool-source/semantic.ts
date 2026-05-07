/**
 * Semantic checks that mirror the ``model_validator`` / ``field_validator``
 * rules added in galaxyproject/galaxy#22615 to ``_DynamicToolSourceBase``,
 * ``UserToolSource``, and ``Citation``. These rules don't render into JSON
 * Schema, so an external validator must replicate them.
 *
 * Drift risk: until Galaxy externalizes these cases as a YAML corpus (see
 * https://github.com/galaxyproject/galaxy/pull/22615 discussion), the
 * fixtures in ``packages/schema/test/user-tool-source.test.ts`` are a
 * hand-port of ``test/unit/tool_util/test_user_tool_source_validation.py``.
 */

import type { UserToolSourceDiagnostic } from "./validate.js";

const TEMPLATE_BLOCK_RE = /\$\(([\s\S]*?)\)/g;
const INPUTS_REF_RE = /\binputs\.([A-Za-z_][A-Za-z0-9_]*)/g;
const DOI_RE = /^10\.\d{4,9}\/.+$/;

function commandInputRefs(text: unknown): Set<string> {
  const refs = new Set<string>();
  if (typeof text !== "string") return refs;
  for (const block of text.matchAll(TEMPLATE_BLOCK_RE)) {
    for (const m of block[1].matchAll(INPUTS_REF_RE)) {
      refs.add(m[1]);
    }
  }
  return refs;
}

function topLevelInputName(input: unknown): string | undefined {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const name = (input as Record<string, unknown>).name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

function isBlank(v: unknown): boolean {
  return typeof v === "string" && v.trim().length === 0;
}

function diag(path: string, message: string, keyword: string): UserToolSourceDiagnostic {
  return { path, message, keyword, params: {} };
}

function checkBlankRequiredFields(doc: Record<string, unknown>): UserToolSourceDiagnostic[] {
  const errors: UserToolSourceDiagnostic[] = [];
  for (const field of ["name", "version"] as const) {
    const v = doc[field];
    if (v !== undefined && v !== null && isBlank(v)) {
      errors.push(diag(`/${field}`, "Value error, must not be empty or whitespace", "semantic"));
    }
  }
  if (doc["class"] === "GalaxyUserTool" && isBlank(doc["container"])) {
    errors.push(diag("/container", "Value error, container must not be empty", "semantic"));
  }
  return errors;
}

function checkInputRefsAndOutputs(doc: Record<string, unknown>): UserToolSourceDiagnostic[] {
  const errors: UserToolSourceDiagnostic[] = [];
  const inputs = Array.isArray(doc.inputs) ? doc.inputs : [];
  const declared = new Set<string>();
  for (const i of inputs) {
    const n = topLevelInputName(i);
    if (n !== undefined) declared.add(n);
  }

  const referenced = new Set<string>();
  for (const r of commandInputRefs(doc.shell_command)) referenced.add(r);
  const configfiles = Array.isArray(doc.configfiles) ? doc.configfiles : [];
  for (const cf of configfiles) {
    if (cf && typeof cf === "object") {
      for (const r of commandInputRefs((cf as Record<string, unknown>).content)) referenced.add(r);
    }
  }

  const undeclared = [...referenced].filter((n) => !declared.has(n)).sort();
  for (const name of undeclared) {
    errors.push(
      diag(
        "/",
        `Value error, references inputs.${name} but no input named '${name}' is declared`,
        "semantic",
      ),
    );
  }

  // Outputs of a tool with shell_command must claim bytes via
  // from_work_dir or discover_datasets.
  if (typeof doc.shell_command === "string") {
    const outputs = Array.isArray(doc.outputs) ? doc.outputs : [];
    outputs.forEach((out, idx) => {
      if (!out || typeof out !== "object") return;
      const o = out as Record<string, unknown>;
      const type = o.type;
      const hasFromWorkDir = typeof o.from_work_dir === "string" && o.from_work_dir.length > 0;
      const hasDiscover =
        Array.isArray(o.discover_datasets) && (o.discover_datasets as unknown[]).length > 0;
      if (type === "data" && !hasFromWorkDir && !hasDiscover) {
        errors.push(
          diag(
            `/outputs/${idx}`,
            "Value error, dataset output must declare from_work_dir or discover_datasets",
            "semantic",
          ),
        );
      } else if (type === "collection" && !hasDiscover) {
        errors.push(
          diag(
            `/outputs/${idx}`,
            "Value error, collection output must declare discover_datasets",
            "semantic",
          ),
        );
      }
    });
  }

  return errors;
}

function checkCitations(doc: Record<string, unknown>): UserToolSourceDiagnostic[] {
  const errors: UserToolSourceDiagnostic[] = [];
  const citations = doc.citations;
  if (!Array.isArray(citations)) return errors;
  citations.forEach((cite, idx) => {
    if (!cite || typeof cite !== "object") return;
    const c = cite as Record<string, unknown>;
    const content = c.content;
    const type = c.type;
    if (typeof content !== "string" || content.length === 0) {
      errors.push(
        diag(`/citations/${idx}`, "Value error, citation content must not be empty", "semantic"),
      );
      return;
    }
    const isDoi = DOI_RE.test(content);
    const isBibtex = /^@\w+\s*\{/.test(content);
    if (type === "doi") {
      if (!isDoi) {
        errors.push(
          diag(
            `/citations/${idx}/content`,
            `Value error, declared as DOI but '${content}' does not match DOI shape (^10\\.\\d{4,9}/.+$)`,
            "semantic",
          ),
        );
      }
    } else if (type === "bibtex") {
      if (!isBibtex) {
        errors.push(
          diag(
            `/citations/${idx}/content`,
            "Value error, declared as bibtex but content does not start with '@<type>{'",
            "semantic",
          ),
        );
      }
    } else if (!isDoi && !isBibtex) {
      errors.push(
        diag(
          `/citations/${idx}`,
          `Value error, citation (type=${JSON.stringify(type)}) is neither a recognizable DOI nor a BibTeX entry`,
          "semantic",
        ),
      );
    }
  });
  return errors;
}

export function runSemanticChecks(doc: Record<string, unknown>): UserToolSourceDiagnostic[] {
  return [
    ...checkBlankRequiredFields(doc),
    ...checkInputRefsAndOutputs(doc),
    ...checkCitations(doc),
  ];
}
