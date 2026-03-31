/**
 * Helpers for converting comments between native and Format2 representations.
 *
 * Port of gxformat2/_comment_helpers.py.
 */

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
export function flattenCommentData(nativeComment: Record<string, unknown>): Record<string, unknown> {
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
export function unflattenCommentData(format2Comment: Record<string, unknown>): Record<string, unknown> {
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
