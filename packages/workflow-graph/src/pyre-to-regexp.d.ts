// pyre-to-regexp ships types.d.ts without a "types" entry or default export declaration.
declare module "pyre-to-regexp" {
  export interface PyreRegExp extends RegExp {
    pyreReplace(source: string, replacement: string): string;
  }
  export default function pyre(pattern: string, namedCaptures?: string[]): PyreRegExp;
}
