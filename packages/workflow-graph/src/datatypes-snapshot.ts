import type { DatatypesCombinedMap } from "./datatypes-combined-map.js";
import { DatatypesMapperModel } from "./datatypes-mapper.js";
import { DATATYPES_SNAPSHOT } from "./datatypes-snapshot.generated.js";

export { DATATYPES_SNAPSHOT };

/** A Galaxy server's `types_and_mapping` response and where it came from. */
export interface DatatypesSnapshot {
  source: {
    galaxyUrl: string;
    path: string;
    versionMajor: string;
    versionMinor: string;
    /** `YYYY-MM-DD` */
    fetchedAt: string;
  };
  typesAndMapping: DatatypesCombinedMap;
}

let mapper: DatatypesMapperModel | undefined;

/** `DatatypesMapperModel` over the committed snapshot; Galaxy builds the same model from its API. */
export function snapshotDatatypesMapper(): DatatypesMapperModel {
  return (mapper ??= new DatatypesMapperModel(DATATYPES_SNAPSHOT.typesAndMapping));
}
