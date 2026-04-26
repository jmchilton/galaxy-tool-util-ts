/**
 * Kahn's-algorithm topological sort over (predecessor, successor) pairs.
 * Self-pairs (a, a) keep nodes that have no real edges in the result.
 * Mirrors galaxy.util.topsort semantics for our purposes.
 */
export function topsort(pairs: Array<[string, string]>): string[] {
  const nodes = new Set<string>();
  const successors: Map<string, Set<string>> = new Map();
  const indegree: Map<string, number> = new Map();

  for (const [a, b] of pairs) {
    nodes.add(a);
    nodes.add(b);
    if (!successors.has(a)) successors.set(a, new Set());
    if (!indegree.has(a)) indegree.set(a, 0);
    if (!indegree.has(b)) indegree.set(b, 0);
    if (a === b) continue;
    if (!successors.get(a)!.has(b)) {
      successors.get(a)!.add(b);
      indegree.set(b, (indegree.get(b) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const n of nodes) {
    if ((indegree.get(n) ?? 0) === 0) queue.push(n);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    result.push(n);
    for (const m of successors.get(n) ?? []) {
      const d = (indegree.get(m) ?? 0) - 1;
      indegree.set(m, d);
      if (d === 0) queue.push(m);
    }
  }

  if (result.length !== nodes.size) {
    throw new Error("topological sort: cycle detected");
  }
  return result;
}
