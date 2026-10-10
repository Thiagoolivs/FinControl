import { assertCents } from "./money";

/** Parcela de `partCents` em `totalCents`, em basis points (10000 = 100%). Total <= 0 → 0. */
export function shareBps(partCents: number, totalCents: number): number {
  assertCents(partCents);
  assertCents(totalCents);
  if (totalCents <= 0) return 0;
  return Math.round((partCents * 10_000) / totalCents);
}

/** Progresso de uma meta em basis points, limitado a 0–10000. */
export function progressBps(currentCents: number, targetCents: number): number {
  return Math.min(10_000, Math.max(0, shareBps(currentCents, targetCents)));
}

/** "128%" a partir de 12800 bps; casas decimais só quando pedidas. */
export function formatBps(bps: number, decimals = 0): string {
  const value = (bps / 100).toFixed(decimals).replace(".", ",");
  return `${value}%`;
}
