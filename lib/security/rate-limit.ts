// Janela fixa em memória. Suficiente para uma instância única no Railway;
// com mais de uma réplica, trocar por contagem no Postgres.

type Window = { count: number; resetAt: number };

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

export type RateLimiter = {
  hit(key: string, now?: number): RateLimitResult;
  reset(key: string): void;
};

const MAX_KEYS_BEFORE_SWEEP = 1000;

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, Window>();

  function sweep(now: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  }

  return {
    hit(key, now = Date.now()) {
      if (windows.size > MAX_KEYS_BEFORE_SWEEP) sweep(now);
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterMs: 0 };
      }
      current.count += 1;
      if (current.count > limit) return { allowed: false, retryAfterMs: current.resetAt - now };
      return { allowed: true, retryAfterMs: 0 };
    },
    reset(key) {
      windows.delete(key);
    },
  };
}
