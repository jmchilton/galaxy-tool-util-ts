import type { DatatypesMapperModel } from "./datatypes-mapper.js";

export class ConnectionAcceptable {
  reason: string | null;
  canAccept: boolean;
  constructor(canAccept: boolean, reason: string | null) {
    this.canAccept = canAccept;
    this.reason = reason;
  }
}

export function producesAcceptableDatatype(
  datatypesMapper: DatatypesMapperModel,
  inputDatatypes: string[],
  otherDatatypes: string[],
) {
  for (const t in inputDatatypes) {
    const thisDatatype = inputDatatypes[t]!;

    if (thisDatatype === "input") {
      return new ConnectionAcceptable(true, null);
    }

    // FIXME: No idea what to do about case when datatype is 'input'
    const validMatch = otherDatatypes.some(
      (otherDatatype) =>
        otherDatatype === "input" ||
        otherDatatype === "_sniff_" ||
        datatypesMapper.isSubType(otherDatatype, thisDatatype),
    );

    if (validMatch) {
      return new ConnectionAcceptable(true, null);
    }
  }
  const datatypesSet = new Set(datatypesMapper.datatypes);
  const invalidDatatypes = otherDatatypes.filter((datatype) => !datatypesSet.has(datatype));
  if (invalidDatatypes.length) {
    return new ConnectionAcceptable(
      false,
      `Effective output data type(s) [${invalidDatatypes.join(
        ", ",
      )}] unknown. This tool cannot be run on this Galaxy Server at this moment, please contact the Administrator.`,
    );
  }
  return new ConnectionAcceptable(
    false,
    `Effective output data type(s) [${otherDatatypes.join(
      ", ",
    )}] do not appear to match input type(s) [${inputDatatypes.join(", ")}].`,
  );
}
