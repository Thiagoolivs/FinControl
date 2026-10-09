import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("bloqueia depois do limite e libera quando a janela vira", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(limiter.hit("k", 0).allowed).toBe(true);
    expect(limiter.hit("k", 10).allowed).toBe(true);
    expect(limiter.hit("k", 20).allowed).toBe(true);
    expect(limiter.hit("k", 30)).toEqual({ allowed: false, retryAfterMs: 970 });
    expect(limiter.hit("k", 1000).allowed).toBe(true);
  });

  it("isola chaves e permite reset", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.hit("a", 0);
    expect(limiter.hit("a", 1).allowed).toBe(false);
    expect(limiter.hit("b", 1).allowed).toBe(true);
    limiter.reset("a");
    expect(limiter.hit("a", 2).allowed).toBe(true);
  });
});
