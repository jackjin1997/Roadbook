/**
 * Per-workspace mutex. Guards long read-modify-write cycles where a handler
 * loads a workspace snapshot from SQLite, mutates it in memory across a slow
 * LLM call, and writes back. Without this, two concurrent handlers clobber
 * each other's writes (last writer wins, earlier work silently discarded).
 *
 * Scope: process-local. Fine for a single-replica Fly.io deploy. If we ever
 * scale out to multiple replicas, replace with a SQLite-level advisory lock
 * or an optimistic-concurrency `updated_at` check.
 */

const locks = new Map<string, Promise<void>>();

export async function withWorkspaceLock<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(workspaceId) ?? Promise.resolve();
  let release!: () => void;
  const chain = prev.then(
    () => new Promise<void>((resolve) => { release = resolve; }),
  );
  locks.set(workspaceId, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    // If no new waiter queued behind us, clear the map entry so it doesn't leak.
    if (locks.get(workspaceId) === chain) {
      locks.delete(workspaceId);
    }
  }
}
