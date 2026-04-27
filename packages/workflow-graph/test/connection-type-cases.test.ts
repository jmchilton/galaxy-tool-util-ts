/* Truth-table consumer for connection_type_cases.yml.

   Synced from Galaxy via `make sync-connection-type-cases`. The same corpus
   drives Python's test_connection_types.py — divergence here means TS and
   Galaxy disagree on collection-type algebra.

   Sentinel resolution:
     YAML `NULL` / `null` / `~` -> NULL_COLLECTION_TYPE_DESCRIPTION
     YAML `ANY`                 -> ANY_COLLECTION_TYPE_DESCRIPTION
     other strings              -> new CollectionTypeDescription(s)

   Op dispatch mirrors connection_types.py module-level wrappers:
     can_match(out, in)        -> in.accepts(out) with sentinel handling
     can_map_over(out, in)     -> out.canMapOver(in) with sentinel handling
     compatible(a, b)          -> a.compatible(b) with sentinel handling
     effective_map_over(out,in)-> out.effectiveMapOver(in).collectionType,
                                  or null when can_map_over is false
*/
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  ANY_COLLECTION_TYPE_DESCRIPTION,
  CollectionTypeDescription,
  NULL_COLLECTION_TYPE_DESCRIPTION,
  type CollectionTypeDescriptor,
} from "../src/collection-type.js";

const CASES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "connection_type_cases.yml",
);

type Op = "can_match" | "can_map_over" | "compatible" | "effective_map_over";

interface Case {
  op: Op;
  output: string | null;
  input: string | null;
  expected: boolean | string | null;
  semantics_ref?: string;
  note?: string;
}

function resolve(token: string | null): CollectionTypeDescriptor {
  if (token === null || token === "NULL") {
    return NULL_COLLECTION_TYPE_DESCRIPTION;
  }
  if (token === "ANY") {
    return ANY_COLLECTION_TYPE_DESCRIPTION;
  }
  return new CollectionTypeDescription(token);
}

function isNullDesc(d: CollectionTypeDescriptor): boolean {
  return d === NULL_COLLECTION_TYPE_DESCRIPTION;
}

function isAnyDesc(d: CollectionTypeDescriptor): boolean {
  return d === ANY_COLLECTION_TYPE_DESCRIPTION;
}

function canMatch(output: CollectionTypeDescriptor, input: CollectionTypeDescriptor): boolean {
  if (isNullDesc(output) || isNullDesc(input)) return false;
  if (isAnyDesc(input)) return !isNullDesc(output);
  if (isAnyDesc(output)) return false;
  return input.accepts(output);
}

function canMapOver(output: CollectionTypeDescriptor, input: CollectionTypeDescriptor): boolean {
  if (isNullDesc(output) || isAnyDesc(output)) return false;
  if (isAnyDesc(input)) return false;
  if (isNullDesc(input)) return true;
  return output.canMapOver(input);
}

function compatibleOp(a: CollectionTypeDescriptor, b: CollectionTypeDescriptor): boolean {
  if (isNullDesc(a) && isNullDesc(b)) return true;
  if (isNullDesc(a) || isNullDesc(b)) return false;
  if (isAnyDesc(a) || isAnyDesc(b)) return true;
  return a.compatible(b);
}

function effectiveMapOver(
  output: CollectionTypeDescriptor,
  input: CollectionTypeDescriptor,
): CollectionTypeDescriptor | null {
  if (!canMapOver(output, input)) return null;
  if (isNullDesc(input)) {
    return new CollectionTypeDescription((output as CollectionTypeDescription).collectionType);
  }
  return output.effectiveMapOver(input);
}

const cases = parseYaml(readFileSync(CASES_PATH, "utf-8")) as Case[];

describe("connection_type_cases.yml truth table", () => {
  it("loads cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    const ref = c.semantics_ref ? `@${c.semantics_ref}` : "";
    const id = `${c.op}[${c.output ?? "NULL"}|${c.input ?? "NULL"}]${ref}`;
    it(id, () => {
      const output = resolve(c.output);
      const input = resolve(c.input);
      if (c.op === "can_match") {
        expect(canMatch(output, input)).toBe(c.expected);
      } else if (c.op === "can_map_over") {
        expect(canMapOver(output, input)).toBe(c.expected);
      } else if (c.op === "compatible") {
        expect(compatibleOp(output, input)).toBe(c.expected);
      } else if (c.op === "effective_map_over") {
        const result = effectiveMapOver(output, input);
        if (c.expected === null) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
          expect((result as CollectionTypeDescription).collectionType).toBe(c.expected);
        }
      } else {
        throw new Error(`unknown op: ${c.op as string}`);
      }
    });
  }
});
