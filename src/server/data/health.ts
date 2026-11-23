import "server-only";

import { getPrisma } from "./client";

export type CheckResult = { ok: true; latencyMs: number } | { ok: false; error: string };

/**
 * Checks that the database answers a trivial query within the time limit.
 * The error message is kept generic so the public health endpoint never
 * leaks hostnames, usernames or driver details.
 */
export async function checkDatabase(timeoutMs = 2000): Promise<CheckResult> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getPrisma().$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    console.error("[health] database check failed:", error);
    const timedOut = error instanceof Error && error.message === "timeout";
    return { ok: false, error: timedOut ? "timeout" : "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
