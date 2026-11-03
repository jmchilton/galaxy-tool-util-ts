/**
 * The `inputs.*` member chains a user-defined tool template reads. Each
 * expression `templateExpressions` finds is parsed with acorn the way Galaxy
 * runs it (`code_fragment_to_js`: `$()` is an expression, `${}` a function body).
 */

import { parse as parseJs, type AnyNode, type MemberExpression, type Pattern } from "acorn";
import { templateExpressions, type TemplateExpression } from "./template-scanner.js";

/** One step of a member chain: a property name, or null for a computed key. */
export type Segment = string | null;

/** A member chain read off `inputs`: the root input name first, then each member. */
export type InputsChain = readonly Segment[];

function isNode(value: unknown): value is AnyNode {
  return !!value && typeof value === "object" && typeof (value as AnyNode).type === "string";
}

function childNodes(node: AnyNode): AnyNode[] {
  return Object.values(node).flatMap((value: unknown) =>
    Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : [],
  );
}

function memberSegment(node: MemberExpression): Segment {
  const property = node.property;
  if (!node.computed) return "name" in property ? property.name : null;
  if (
    property.type === "Literal" &&
    (typeof property.value === "string" || typeof property.value === "number")
  ) {
    return String(property.value);
  }
  return null;
}

/** The segments after `inputs` when `node` is a member chain rooted at the `inputs` identifier. */
function inputsChain(node: MemberExpression): Segment[] | null {
  const segments: Segment[] = [];
  let current: AnyNode = node;
  while (current.type === "MemberExpression") {
    segments.unshift(memberSegment(current));
    current = current.object;
  }
  return current.type === "Identifier" && current.name === "inputs" ? segments : null;
}

/** Identifiers a binding pattern (`x`, `{a, b: [c]}`, `...rest`, `d = 1`) declares. */
function patternNames(pattern: Pattern | null | undefined): string[] {
  switch (pattern?.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((p) =>
        patternNames(p.type === "RestElement" ? p : p.value),
      );
    case "ArrayPattern":
      return pattern.elements.flatMap(patternNames);
    case "RestElement":
      return patternNames(pattern.argument);
    case "AssignmentPattern":
      return patternNames(pattern.left);
    default:
      return [];
  }
}

/** The patterns `node` binds names with: parameters, variables, catch params, function and class names. */
function bindings(node: AnyNode): (Pattern | null | undefined)[] {
  switch (node.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      return [node.id, ...node.params];
    case "VariableDeclarator":
      return [node.id];
    case "CatchClause":
      return [node.param];
    case "ClassDeclaration":
      return [node.id];
    default:
      return [];
  }
}

/** Whether the expression declares its own `inputs` (a parameter, variable or function). */
function bindsInputs(node: AnyNode): boolean {
  return (
    bindings(node).some((b) => patternNames(b).includes("inputs")) ||
    childNodes(node).some(bindsInputs)
  );
}

/** Every maximal `inputs...` member chain in `node`. */
function collectChains(node: AnyNode, chains: Segment[][] = []): Segment[][] {
  const chain = node.type === "MemberExpression" ? inputsChain(node) : null;
  if (!chain) {
    childNodes(node).forEach((child) => collectChains(child, chains));
    return chains;
  }
  chains.push(chain);
  // Computed keys inside the chain (`inputs.a[inputs.b]`) are chains of their own.
  for (let m: AnyNode = node; m.type === "MemberExpression"; m = m.object) {
    if (m.computed) collectChains(m.property, chains);
  }
  return chains;
}

function parseExpression(expr: TemplateExpression): AnyNode | null {
  const source = expr.kind === "paren" ? `(${expr.body}\n)` : `(function(){${expr.body}\n})`;
  try {
    return parseJs(source, { ecmaVersion: "latest" });
  } catch {
    // Not valid JavaScript; nothing to resolve.
    return null;
  }
}

/**
 * Every `inputs...` member chain the template's expressions read. Expressions
 * that don't parse, or that rebind `inputs` (reading their own values, not the
 * job's), are skipped.
 */
export function templateChains(template: string): InputsChain[] {
  return templateExpressions(template).flatMap((expr) => {
    const ast = parseExpression(expr);
    return !ast || bindsInputs(ast) ? [] : collectChains(ast);
  });
}
