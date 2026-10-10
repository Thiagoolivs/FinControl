import { createHash, timingSafeEqual } from "node:crypto";

/** Compara segredos em tempo constante (hash antes, para não vazar o tamanho). */
export function secretsMatch(received: string, expected: string): boolean {
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** `Authorization: Bearer <segredo>` → segredo; qualquer outro formato → null. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer (\S+)$/.exec(header ?? "");
  return match?.[1] ?? null;
}
