import { assertCents } from "./money";

/** Uma transação de gasto no mês: saída negativa, estorno positivo. */
export type DailySpendRow = { day: number; amountCents: number };

/**
 * Gasto acumulado dia a dia, do dia 1 até `days` (índice 0 = fim do dia 1). Saídas somam, estornos
 * abatem; a curva nunca fica abaixo de zero (estorno antes do gasto não vira "gasto negativo").
 */
export function cumulativeSpend(rows: readonly DailySpendRow[], days: number): number[] {
  if (!Number.isInteger(days) || days < 0 || days > 31) throw new RangeError(`Dias inválidos: ${days}`);
  const byDay = new Array<number>(days).fill(0);
  for (const row of rows) {
    assertCents(row.amountCents);
    if (!Number.isInteger(row.day) || row.day < 1) throw new RangeError(`Dia inválido: ${row.day}`);
    if (row.day > days) continue;
    byDay[row.day - 1] = (byDay[row.day - 1] ?? 0) - row.amountCents;
  }
  let running = 0;
  return byDay.map((cents) => {
    running += cents;
    return Math.max(0, running);
  });
}

/** Gasto (líquido de estornos, nunca negativo) até o dia `day`, inclusive. */
export function spendUntil(rows: readonly DailySpendRow[], day: number): number {
  const net = rows.filter((row) => row.day <= day).reduce((sum, row) => {
    assertCents(row.amountCents);
    return sum - row.amountCents;
  }, 0);
  return Math.max(0, net);
}
