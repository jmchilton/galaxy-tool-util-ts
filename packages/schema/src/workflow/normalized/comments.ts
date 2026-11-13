/**
 * Helpers for converting comments between native and Format2 representations.
 *
 * Port of gxformat2/_comment_helpers.py.
 */

import type { NormalizedFormat2Workflow } from "./format2.js";
import { format2StepLabelIndices } from "./labels.js";

// Mapping from native comment data.* field names to Format2 top-level field names.
const COMMENT_DATA_FIELDS: Record<string, Record<string, string>> = {
  text: { text: "text", bold: "bold", italic: "italic", size: "text_size" },
  markdown: { text: "text" },
  frame: { title: "title" },
  freehand: { thickness: "thickness", line: "line" },
};

const COMMENT_COMMON_FIELDS = ["type", "position", "size", "color"] as const;

/**
 * Convert a native comment dict to Format2 representation.
 *
 * Hoists type-specific fields from nested `data` dict to top level.
 * Renames child_steps → contains_steps and child_comments → contains_comments.
 * Drops the `id` field.
 */
export function flattenCommentData(
  nativeComment: Record<string, unknown>,
): Record<string, unknown> {
  const commentType = nativeComment.type as string;
  const result: Record<string, unknown> = {};

  for (const field of COMMENT_COMMON_FIELDS) {
    if (field in nativeComment) {
      result[field] = nativeComment[field];
    }
  }

  if ("label" in nativeComment) {
    result.label = nativeComment.label;
  }

  const data = (nativeComment.data ?? {}) as Record<string, unknown>;
  const fieldMap = COMMENT_DATA_FIELDS[commentType] ?? {};
  for (const [nativeName, format2Name] of Object.entries(fieldMap)) {
    if (nativeName in data) {
      result[format2Name] = data[nativeName];
    }
  }

  if ("child_steps" in nativeComment) {
    result.contains_steps = nativeComment.child_steps;
  }
  if ("child_comments" in nativeComment) {
    result.contains_comments = nativeComment.child_comments;
  }

  return result;
}

/**
 * Convert a Format2 comment dict to native representation.
 *
 * Collects type-specific top-level fields back into a nested `data` dict.
 * Renames contains_steps → child_steps and contains_comments → child_comments.
 */
export function unflattenCommentData(
  format2Comment: Record<string, unknown>,
): Record<string, unknown> {
  const commentType = format2Comment.type as string;
  const result: Record<string, unknown> = {};

  for (const field of COMMENT_COMMON_FIELDS) {
    if (field in format2Comment) {
      result[field] = format2Comment[field];
    }
  }

  if ("label" in format2Comment) {
    result.label = format2Comment.label;
  }

  const data: Record<string, unknown> = {};
  const fieldMap = COMMENT_DATA_FIELDS[commentType] ?? {};
  for (const [nativeName, format2Name] of Object.entries(fieldMap)) {
    if (format2Name in format2Comment) {
      data[nativeName] = format2Comment[format2Name];
    }
  }
  result.data = data;

  if ("contains_steps" in format2Comment) {
    result.child_steps = format2Comment.contains_steps;
  }
  if ("contains_comments" in format2Comment) {
    result.child_comments = format2Comment.contains_comments;
  }

  return result;
}

/** Format2 comments as a list; dict-form keys become labels unless one is set. */
export function format2CommentList(wf: NormalizedFormat2Workflow): Record<string, unknown>[] {
  const comments = (wf as Record<string, unknown>).comments;
  if (Array.isArray(comments)) return comments as Record<string, unknown>[];
  if (comments && typeof comments === "object") {
    return Object.entries(comments as Record<string, unknown>).map(([label, comment]) => ({
      label,
      ...(comment as Record<string, unknown>),
    }));
  }
  return [];
}

/** A frame `contains_steps` / `contains_comments` entry naming nothing in its workflow. */
export interface UnresolvedFrameReference {
  commentIndex: number;
  field: "contains_steps" | "contains_comments";
  entryIndex: number;
  message: string;
}

/** Name a frame in messages by its title, then label, then comment index. */
export function frameDescription(frame: Record<string, unknown>, commentIndex: number): string {
  const name = frame.title || frame.label;
  return name ? `Frame '${String(name)}'` : `Frame ${commentIndex}`;
}

/**
 * Frame entries matching no label, or indexing past the steps/inputs (or comments) at this level.
 *
 * Labels win; `contains_steps` indices (ints, digit strings) are native step ids: inputs first.
 */
export function unresolvedFrameReferences(
  wf: NormalizedFormat2Workflow,
): UnresolvedFrameReference[] {
  const comments = format2CommentList(wf);
  const stepLabels = format2StepLabelIndices(wf);
  const commentLabels = new Set(
    comments.map((c) => c.label).filter((l) => typeof l === "string" && l),
  );
  const checks: FrameRefCheck[] = [
    {
      field: "contains_steps",
      labelKind: "step or input",
      indexNoun: "step",
      labels: stepLabels,
      indexCount: wf.inputs.length + wf.steps.length,
      digitStringsAreIndices: true,
    },
    {
      field: "contains_comments",
      labelKind: "comment",
      indexNoun: "comment",
      labels: commentLabels,
      indexCount: comments.length,
      digitStringsAreIndices: false,
    },
  ];

  const unresolved: UnresolvedFrameReference[] = [];
  comments.forEach((comment, commentIndex) => {
    if (comment.type !== "frame") return;
    for (const check of checks) {
      entries(comment[check.field]).forEach((ref, entryIndex) => {
        const problem = frameRefProblem(check, ref);
        if (problem) {
          unresolved.push({
            commentIndex,
            field: check.field,
            entryIndex,
            message: `${frameDescription(comment, commentIndex)} references ${problem} in ${check.field}`,
          });
        }
      });
    }
  });
  return unresolved;
}

/** How one frame membership field resolves its entries. */
interface FrameRefCheck {
  field: UnresolvedFrameReference["field"];
  labelKind: string;
  indexNoun: string;
  labels: { has(label: string): boolean };
  indexCount: number;
  digitStringsAreIndices: boolean;
}

/** Describe why `ref` doesn't resolve, or `null`; labels win over indices. */
function frameRefProblem(check: FrameRefCheck, ref: unknown): string | null {
  if (typeof ref === "string") {
    if (check.labels.has(ref)) return null;
    if (!(check.digitStringsAreIndices && /^[0-9]+$/.test(ref))) {
      return `unknown ${check.labelKind} label '${ref}'`;
    }
  } else if (!Number.isInteger(ref)) {
    return null;
  }
  const index = Number(ref);
  if (index >= 0 && index < check.indexCount) return null;
  return `out-of-range ${check.indexNoun} index '${ref}'`;
}

function entries(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
