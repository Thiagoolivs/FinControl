/**
 * Marcas "redondas" (1, 2, 5 × 10^k) cobrindo [min, max], sempre incluindo o zero.
 * Valores em centavos; o passo é múltiplo de R$ 1.
 */
export function niceTicks(min: number, max: number, targetCount = 4): number[] {
  const low = Math.min(min, 0);
  const high = Math.max(max, 0);
  if (low === high) return [0];
  const rawStep = (high - low) / Math.max(1, targetCount);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = Math.max(100, factor * magnitude);
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end; value += step) ticks.push(Math.round(value));
  return ticks;
}
