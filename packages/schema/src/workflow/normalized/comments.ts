/**
 * Helpers for converting comments between native and Format2 representations.
 *
 * Port of gxformat2/_comment_helpers.py.
 */

import type { NormalizedFormat2Workflow } from "./format2.js";

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
export function format2CommentList(comments: unknown): Record<string, unknown>[] {
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
 * Frame string entries matching no step/input label (or comment label) at this level.
 *
 * Integer entries and all-digit `contains_steps` strings are indices and pass through.
 */
export function unresolvedFrameReferences(
  wf: NormalizedFormat2Workflow,
): UnresolvedFrameReference[] {
  const comments = format2CommentList((wf as Record<string, unknown>).comments);
  const stepLabels = new Set<string>();
  for (const inp of wf.inputs) if (inp.id) stepLabels.add(inp.id);
  for (const step of wf.steps) {
    const label = step.label ?? step.id;
    if (label) stepLabels.add(label);
  }
  const commentLabels = new Set(
    comments.map((c) => c.label).filter((l) => typeof l === "string" && l),
  );

  const unresolved: UnresolvedFrameReference[] = [];
  comments.forEach((comment, commentIndex) => {
    if (comment.type !== "frame") return;
    const frame = frameDescription(comment, commentIndex);
    entries(comment.contains_steps).forEach((ref, entryIndex) => {
      if (typeof ref === "string" && !stepLabels.has(ref) && !/^\d+$/.test(ref)) {
        unresolved.push({
          commentIndex,
          field: "contains_steps",
          entryIndex,
          message: `${frame} references unknown step or input label '${ref}' in contains_steps`,
        });
      }
    });
    entries(comment.contains_comments).forEach((ref, entryIndex) => {
      if (typeof ref === "string" && !commentLabels.has(ref)) {
        unresolved.push({
          commentIndex,
          field: "contains_comments",
          entryIndex,
          message: `${frame} references unknown comment label '${ref}' in contains_comments`,
        });
      }
    });
  });
  return unresolved;
}

function entries(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
