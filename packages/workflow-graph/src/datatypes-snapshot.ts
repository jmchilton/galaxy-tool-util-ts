import { DATATYPES_SNAPSHOT } from "./datatypes-snapshot.generated.js";
import { DatatypesMapperModel } from "./datatypes-mapper.js";

export { DATATYPES_SNAPSHOT };
export type DatatypesSnapshot = typeof DATATYPES_SNAPSHOT;

let mapper: DatatypesMapperModel | undefined;

/** `DatatypesMapperModel` over the committed snapshot; Galaxy builds the same model from its API. */
export function snapshotDatatypesMapper(): DatatypesMapperModel {
  return (mapper ??= new DatatypesMapperModel(DATATYPES_SNAPSHOT.typesAndMapping));
}
