/** A serialized wrapper document, as returned by Galaxy or the Tool Shed. */
export interface ToolSourceDocument {
  contents: string;
  language: "xml" | "yaml" | "json" | "cwl" | "text";
  /** XML serializers return the macro-expanded tree; other formats have no XML macros. */
  macrosExpanded: boolean;
}

export function isToolSourceDocument(value: unknown): value is ToolSourceDocument {
  if (value === null || typeof value !== "object") return false;
  const source = value as ToolSourceDocument;
  return (
    typeof source.contents === "string" &&
    ["xml", "yaml", "json", "cwl", "text"].includes(source.language) &&
    typeof source.macrosExpanded === "boolean"
  );
}
