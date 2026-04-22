import DatatypesJson from "./fixtures/datatypes.json" with { type: "json" };
import DatatypesMappingJson from "./fixtures/datatypes.mapping.json" with { type: "json" };

import type { DatatypesCombinedMap } from "../src/datatypes-combined-map.js";
import { DatatypesMapperModel } from "../src/datatypes-mapper.js";

export const testTypesAndMapping: DatatypesCombinedMap = {
  datatypes: DatatypesJson,
  datatypes_mapping: DatatypesMappingJson,
};

export const testDatatypesMapper = new DatatypesMapperModel(testTypesAndMapping);
