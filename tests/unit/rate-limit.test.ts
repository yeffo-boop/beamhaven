import { describe, expect, it } from "vitest";

import { createRateLimiter } from "@/server/security/rate-limit";

describe("createRateLimiter", () => {
  it("allows a set number of attempts per window, per key", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });
    expect(limiter.attempt("a", 0)).toBe(true);
    expect(limiter.attempt("a", 10)).toBe(true);
    expect(limiter.attempt("a", 20)).toBe(false);
    expect(limiter.attempt("b", 20)).toBe(true);
  });

  it("starts counting again after the window", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(limiter.attempt("a", 0)).toBe(true);
    expect(limiter.attempt("a", 500)).toBe(false);
    expect(limiter.attempt("a", 1000)).toBe(true);
  });
});
