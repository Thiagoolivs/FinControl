import { addMonths } from "@/lib/dates";
import { assertCents } from "./money";

export type InstallmentRow = {
  /** Identifica a compra: cartão + descrição + total de parcelas + valor + mês da 1ª parcela. */
  purchaseKey: string;
  date: string;
  amountCents: number;
  current: number;
  total: number;
};

export type FutureInstallment = { purchaseKey: string; month: string; amountCents: number; number: number; total: number };

/** Mês da primeira parcela, para separar compras iguais feitas em meses diferentes. */
export function firstInstallmentMonth(date: string, current: number): string {
  return addMonths(date.slice(0, 7), -(current - 1));
}

/**
 * Parcelas que ainda vão cair, a partir da última vista de cada compra (uma por mês), a partir de
 * `fromMonth` inclusive. Parcela já lançada nunca volta: só as de número maior que a última vista.
 */
export function futureInstallments(rows: readonly InstallmentRow[], fromMonth: string): FutureInstallment[] {
  const latest = new Map<string, InstallmentRow>();
  for (const row of rows) {
    assertCents(row.amountCents);
    if (!Number.isInteger(row.current) || !Number.isInteger(row.total) || row.total < 2 || row.current < 1 || row.current > row.total) continue;
    const seen = latest.get(row.purchaseKey);
    if (!seen || row.current > seen.current) latest.set(row.purchaseKey, row);
  }
  const future: FutureInstallment[] = [];
  for (const row of latest.values()) {
    for (let number = row.current + 1; number <= row.total; number += 1) {
      const month = addMonths(row.date.slice(0, 7), number - row.current);
      if (month >= fromMonth) future.push({ purchaseKey: row.purchaseKey, month, amountCents: row.amountCents, number, total: row.total });
    }
  }
  return future.sort((a, b) => (a.month === b.month ? a.purchaseKey.localeCompare(b.purchaseKey) : a.month < b.month ? -1 : 1));
}
