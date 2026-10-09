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
