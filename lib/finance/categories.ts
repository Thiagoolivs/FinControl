import { assertCents } from "./money";
import { shareBps } from "./share";

export type CategorySpend = {
  id: string;
  name: string;
  icon: string;
  cents: number;
  /** Gasto em relação à média dos últimos meses, em bps (12800 = 128%). Null quando não há histórico. */
  averageRatioBps: number | null;
};

export type CategorySlice = CategorySpend & {
  shareBps: number;
  isOther: boolean;
};

/**
 * Ordena por valor e, se houver mais que `maxVisible` categorias, junta as menores em "Outras N".
 * O total nunca muda: a soma das fatias é sempre a soma da entrada.
 */
export function foldCategories(items: readonly CategorySpend[], maxVisible: number): CategorySlice[] {
  for (const item of items) assertCents(item.cents);
  const sorted = [...items].sort((a, b) => b.cents - a.cents);
  const total = sorted.reduce((sum, item) => sum + item.cents, 0);
  const slice = (item: CategorySpend, isOther: boolean): CategorySlice => ({
    ...item,
    shareBps: shareBps(item.cents, total),
    isOther,
  });

  if (sorted.length <= maxVisible) return sorted.map((item) => slice(item, false));

  const visible = sorted.slice(0, Math.max(1, maxVisible - 1));
  const rest = sorted.slice(visible.length);
  const other: CategorySpend = {
    id: "outras",
    name: `Outras ${rest.length}`,
    icon: "dots",
    cents: rest.reduce((sum, item) => sum + item.cents, 0),
    averageRatioBps: null,
  };
  return [...visible.map((item) => slice(item, false)), slice(other, true)];
}

export type CategorySpendRow = { categoryId: string | null; amountCents: number };

/**
 * Gasto por categoria de primeiro nível: saídas somam, entradas na mesma categoria (estorno) abatem.
 * Subcategoria sobe para a mãe; `null` = sem categoria. Resultado negativo (mais estorno que gasto) vira 0.
 */
export function spendByTopCategory(
  rows: readonly CategorySpendRow[],
  parentOf: ReadonlyMap<string, string | null>,
): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const row of rows) {
    assertCents(row.amountCents);
    const top = row.categoryId === null ? null : (parentOf.get(row.categoryId) ?? row.categoryId);
    totals.set(top, (totals.get(top) ?? 0) - row.amountCents);
  }
  for (const [key, cents] of totals) if (cents < 0) totals.set(key, 0);
  return totals;
}

/**
 * Gasto atual em relação à média mensal dos meses anteriores, em bps (12800 = 128%).
 * Null quando não há histórico (nenhum mês anterior com gasto): sem média, não há comparação honesta.
 */
export function averageRatioBps(currentCents: number, previousMonthsCents: readonly number[]): number | null {
  assertCents(currentCents);
  for (const cents of previousMonthsCents) assertCents(cents);
  const total = previousMonthsCents.reduce((sum, cents) => sum + cents, 0);
  if (previousMonthsCents.length === 0 || total <= 0) return null;
  return Math.round((currentCents * 10_000 * previousMonthsCents.length) / total);
}
