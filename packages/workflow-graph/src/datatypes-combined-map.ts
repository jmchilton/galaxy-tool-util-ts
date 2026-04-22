/**
 * Minimal hand-written equivalent of Galaxy's generated
 * `components["schemas"]["DatatypesCombinedMap"]` type.
 *
 * Galaxy's canonical definition lives in the Pydantic model
 * `DatatypesCombinedMap` under `lib/galaxy/schema/`. The Galaxy-side re-export
 * site enforces structural compatibility at compile time, so drift would be
 * caught loudly. See the extraction plan (D2) for the decision rationale.
 */
export interface DatatypesCombinedMap {
  datatypes: string[];
  datatypes_mapping: {
    ext_to_class_name: Record<string, string>;
    class_to_classes: Record<string, Record<string, boolean>>;
  };
}
