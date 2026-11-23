import "server-only";

import { headers } from "next/headers";

import { getEnv } from "@/config/env";

/**
 * A small in-memory rate limiter for our own Server Actions (Better Auth
 * limits its own endpoints). Counts are kept in the app's memory, which is
 * fine for one server; they reset when the app restarts (ADR-020).
 */
export function createRateLimiter(options: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    /** Records one attempt. Returns false once `key` has used up its attempts. */
    attempt(key: string, now: number = Date.now()): boolean {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + options.windowMs });
        if (hits.size > 10_000) prune(now);
        return true;
      }
      entry.count += 1;
      return entry.count <= options.max;
    },
  };

  function prune(now: number) {
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }
}

/**
 * The visitor's IP address, read from X-Real-IP only when we're behind our
 * own proxy (TRUST_PROXY=true), the same rule Better Auth uses (ADR-018).
 * Otherwise everyone shares one bucket, which errs on the side of limiting.
 */
export async function clientAddress(): Promise<string> {
  if (!getEnv().TRUST_PROXY) return "unknown";
  return (await headers()).get("x-real-ip")?.trim() || "unknown";
}
