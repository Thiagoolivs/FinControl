import { addDays, addMonths, daysBetween, monthRange } from "@/lib/dates";
import { assertCents } from "./money";

export type RecurringCandidate = { id: string; key: string; date: string; amountCents: number };

export type Cadence = { intervalDays: 7 | 30 | 365; minGap: number; maxGap: number; graceDays: number };

// Ordem de preferência: mensal é o caso comum (salário, assinatura, aluguel).
const CADENCES: readonly Cadence[] = [
  { intervalDays: 30, minGap: 25, maxGap: 35, graceDays: 10 },
  { intervalDays: 7, minGap: 6, maxGap: 8, graceDays: 3 },
  { intervalDays: 365, minGap: 350, maxGap: 380, graceDays: 30 },
];

export const MIN_OCCURRENCES = 3;

export type DetectedSeries = {
  key: string;
  avgAmountCents: number;
  intervalDays: Cadence["intervalDays"];
  occurrences: number;
  lastDate: string;
  nextExpectedDate: string;
  /** false quando a próxima ocorrência passou da tolerância sem chegar: a série acabou. */
  active: boolean;
  transactionIds: string[];
};

/** Dentro de ±10% de `reference` (e do mesmo sinal). */
export function withinTolerance(amountCents: number, referenceCents: number): boolean {
  if (Math.sign(amountCents) !== Math.sign(referenceCents)) return false;
  return Math.abs(amountCents - referenceCents) * 10 <= Math.abs(referenceCents);
}

/** Média em centavos, arredondada no meio centavo para longe do zero. */
export function averageCents(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("Média de lista vazia.");
  const sum = values.reduce((total, value) => total + value, 0);
  const sign = sum < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(sum) / values.length);
}

/** Próxima data esperada: mensal mantém o dia (limitado ao fim do mês), semanal +7, anual +12 meses. */
export function nextOccurrence(date: string, intervalDays: Cadence["intervalDays"]): string {
  if (intervalDays === 7) return addDays(date, 7);
  const month = addMonths(date.slice(0, 7), intervalDays === 30 ? 1 : 12);
  const lastDay = monthRange(month).to;
  const day = `${month}-${date.slice(8, 10)}`;
  return day > lastDay ? lastDay : day;
}

/**
 * Séries recorrentes: mesma chave, intervalo regular (semanal, mensal ou anual) e pelo menos 3
 * ocorrências com o mesmo valor (±10% da mediana das 3 últimas). Um intervalo grande demais encerra a
 * série naquele ponto: vale a sequência mais recente.
 */
export function detectRecurring(candidates: readonly RecurringCandidate[], today: string): DetectedSeries[] {
  const byKey = new Map<string, RecurringCandidate[]>();
  for (const candidate of candidates) {
    assertCents(candidate.amountCents);
    if (candidate.amountCents === 0) continue;
    byKey.set(candidate.key, [...(byKey.get(candidate.key) ?? []), candidate]);
  }
  const series: DetectedSeries[] = [];
  for (const [key, rows] of byKey) {
    if (rows.length < MIN_OCCURRENCES) continue;
    const sorted = [...rows].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
    const found = longestRecentRun(sorted);
    if (!found) continue;
    const { run, cadence } = found;
    // Valor: ±10% da mediana das 3 últimas. Ocorrência fora disso ocupa a vaga do período mas não entra na média.
    const lastThree = run.slice(-MIN_OCCURRENCES).map((row) => row.amountCents).sort((a, b) => a - b);
    const reference = lastThree[1] ?? 0;
    const matching = run.filter((row) => withinTolerance(row.amountCents, reference));
    const last = run[run.length - 1];
    if (matching.length < MIN_OCCURRENCES || !last) continue;
    const next = nextOccurrence(last.date, cadence.intervalDays);
    series.push({
      key,
      avgAmountCents: averageCents(matching.map((row) => row.amountCents)),
      intervalDays: cadence.intervalDays,
      occurrences: matching.length,
      lastDate: last.date,
      nextExpectedDate: next,
      active: daysBetween(next, today) <= cadence.graceDays,
      transactionIds: matching.map((row) => row.id),
    });
  }
  return series.sort((a, b) => a.key.localeCompare(b.key));
}

/** A sequência mais recente com intervalo regular, testando cada cadência. */
function longestRecentRun(rows: readonly RecurringCandidate[]): { run: RecurringCandidate[]; cadence: Cadence } | null {
  const last = rows[rows.length - 1];
  if (!last) return null;
  for (const cadence of CADENCES) {
    const run = [last];
    for (let index = rows.length - 2; index >= 0; index -= 1) {
      const row = rows[index];
      const head = run[0];
      if (!row || !head) break;
      const gap = daysBetween(row.date, head.date);
      if (gap < cadence.minGap) continue; // cobrança duplicada no mesmo período: não conta, não quebra
      if (gap > cadence.maxGap) break;
      run.unshift(row);
    }
    if (run.length >= MIN_OCCURRENCES) return { run, cadence };
  }
  return null;
}
