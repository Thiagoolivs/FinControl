import { assertCents } from "./money";

/** Passou de `limitBps` da média (12000 = 120%)? Sem média (sem histórico ou zero) nunca passa. */
export function exceedsAverage(currentCents: number, averageCents: number, limitBps: number): boolean {
  assertCents(currentCents);
  assertCents(averageCents);
  if (averageCents <= 0) return false;
  return currentCents * 10_000 > averageCents * limitBps;
}

export type MeiStage = "aviso" | "estourou";

/**
 * Faturamento do MEI no ano contra o teto: "aviso" a partir de `warnBps` do teto (8000 = 80%),
 * "estourou" quando passa do teto. Os dois valores são do usuário (o teto muda por lei).
 */
export function meiLimitStage(revenueCents: number, limitCents: number, warnBps: number): MeiStage | null {
  assertCents(revenueCents);
  assertCents(limitCents);
  if (limitCents <= 0) return null;
  if (revenueCents > limitCents) return "estourou";
  if (revenueCents * 10_000 >= limitCents * warnBps) return "aviso";
  return null;
}
