/**
 * Find the JavaScript in a user-defined tool template the way Galaxy does:
 * Galaxy's `do_eval` hands templates to `cwl_utils.expression.interpolate`,
 * which finds each `$(...)` expression and `${...}` function body with
 * `cwl_utils.expression.scanner`. `scanWindow` is a port of that scanner.
 */

export interface TemplateExpression {
  /** `paren` for a `$(...)` expression, `brace` for a `${...}` function body. */
  kind: "paren" | "brace";
  body: string;
}

type State = "default" | "dollar" | "paren" | "brace" | "single" | "double" | "backslash";

/**
 * The next `$(...)` / `${...}` window, or a backslash escape, as `[start, end)`.
 * Returns null when none remains or the block is unterminated (Galaxy's
 * `validate_expression_template` reports that).
 */
function scanWindow(scan: string): [number, number] | null {
  const stack: State[] = ["default"];
  const top = (): State => stack[stack.length - 1];
  let start = 0;
  for (let i = 0; i < scan.length; i++) {
    const c = scan[i];
    switch (top()) {
      case "default":
        if (c === "$") stack.push("dollar");
        else if (c === "\\") stack.push("backslash");
        break;
      case "backslash":
        stack.pop();
        if (top() === "default") return [i - 1, i + 1];
        break;
      case "dollar":
        if (c === "(" || c === "{") {
          start = i - 1;
          stack.push(c === "(" ? "paren" : "brace");
        } else {
          stack.pop();
          i--;
        }
        break;
      case "paren":
      case "brace": {
        const open = top() === "paren" ? "(" : "{";
        const close = open === "(" ? ")" : "}";
        if (c === open) stack.push(top());
        else if (c === close) {
          stack.pop();
          if (top() === "dollar") return [start, i + 1];
        } else if (c === "'") stack.push("single");
        else if (c === '"') stack.push("double");
        break;
      }
      case "single":
      case "double":
        if (c === (top() === "single" ? "'" : '"')) stack.pop();
        else if (c === "\\") stack.push("backslash");
        break;
    }
  }
  return null;
}

/** Every expression `interpolate` would evaluate in `template`, skipping escapes. */
export function templateExpressions(template: string): TemplateExpression[] {
  const found: TemplateExpression[] = [];
  let scan = template;
  for (let window = scanWindow(scan); window; window = scanWindow(scan)) {
    const [start, end] = window;
    if (scan[start] === "$") {
      found.push({
        kind: scan[start + 1] === "(" ? "paren" : "brace",
        body: scan.slice(start + 2, end - 1),
      });
    }
    scan = scan.slice(end);
  }
  return found;
}
