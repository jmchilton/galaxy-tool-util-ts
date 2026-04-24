import { expect } from "vitest";

export interface ExpectationEntry {
  target: Array<string | number>;
  value: unknown;
}

function walk(root: unknown, path: Array<string | number>): unknown {
  let cursor: unknown = root;
  for (const part of path) {
    if (cursor === null || cursor === undefined) {
      throw new Error(
        `Path ${JSON.stringify(path)} walked into null/undefined at ${JSON.stringify(part)}`,
      );
    }
    cursor = (cursor as Record<string | number, unknown>)[part as never];
  }
  return cursor;
}

export function dictVerifyEach(
  targetDict: Record<string, unknown>,
  expectations: ExpectationEntry[],
): void {
  // Round-trip through JSON to match the Python assert_json_encodable check.
  JSON.stringify(targetDict);
  const exception = targetDict.exception;
  if (exception) {
    throw new Error(`Test failed to generate with exception ${String(exception)}`);
  }
  for (const { target, value } of expectations) {
    const actual = walk(targetDict, target);
    expect(actual, `${JSON.stringify(target)}`).toEqual(value);
  }
}
