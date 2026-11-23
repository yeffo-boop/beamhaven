/**
 * Task dependencies (Milestone 7, ADR-031): "task A waits on task B" is an
 * edge A → B. Pure, so it can be tested on its own.
 */

/** Whether `from` waits on `target`, directly or through other tasks. */
export function waitsOnEventually(
  edges: readonly { taskId: string; dependsOnId: string }[],
  from: string,
  target: string,
): boolean {
  const next = new Map<string, string[]>();
  for (const e of edges) next.set(e.taskId, [...(next.get(e.taskId) ?? []), e.dependsOnId]);
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(next.get(id) ?? []));
  }
  return false;
}
