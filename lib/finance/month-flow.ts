import { assertCents } from "./money";

/** Tipo da categoria da transação (transferência já fica de fora antes). */
export type FlowCategoryKind = "ESSENCIAL" | "VARIAVEL" | "INVESTIMENTO" | "RECEITA";

export type MonthFlowRow = {
  amountCents: number;
  categoryKind: FlowCategoryKind | null;
  hasStream: boolean;
};

export type MonthFlow = {
  /** O que entrou: receita de stream, categoria de entrada e entrada sem classificação. */
  incomeCents: number;
  essentialCents: number;
  /** Gastos variáveis: o "estilo de vida". */
  lifestyleCents: number;
  /** Saídas ainda sem categoria (na fila de revisão). */
  uncategorizedCents: number;
  investedCents: number;
  /** essential + lifestyle + uncategorized. */
  spentCents: number;
  /** O que sobrou do que entrou (≥ 0). */
  leftoverCents: number;
  /** Quanto saiu além do que entrou (≥ 0): veio de saldo anterior, cartão ou resgate. */
  overflowCents: number;
};

/**
 * Para onde foi o dinheiro de um período. Saídas somam no tipo da categoria; entrada com categoria de
 * gasto é estorno e abate o tipo; resgate (entrada em Investimentos) abate o investido. O que volta além
 * do que saiu em um tipo conta como entrada: é dinheiro que entrou no período.
 */
export function summarizeMonthFlow(rows: readonly MonthFlowRow[]): MonthFlow {
  let incomeCents = 0;
  const net = { ESSENCIAL: 0, VARIAVEL: 0, INVESTIMENTO: 0, SEM: 0 };
  for (const row of rows) {
    assertCents(row.amountCents);
    if (row.amountCents === 0) continue;
    const kind = row.categoryKind;
    if (row.amountCents > 0) {
      if (row.hasStream || kind === null || kind === "RECEITA") incomeCents += row.amountCents;
      else net[kind] -= row.amountCents;
      continue;
    }
    // Saída com categoria de entrada não deveria existir (o servidor recusa); se vier, fica sem categoria.
    const bucket = kind === null || kind === "RECEITA" ? "SEM" : kind;
    net[bucket] -= row.amountCents;
  }
  const settle = (cents: number): number => {
    if (cents >= 0) return cents;
    incomeCents -= cents;
    return 0;
  };
  const essentialCents = settle(net.ESSENCIAL);
  const lifestyleCents = settle(net.VARIAVEL);
  const uncategorizedCents = settle(net.SEM);
  const investedCents = settle(net.INVESTIMENTO);
  const spentCents = essentialCents + lifestyleCents + uncategorizedCents;
  const balance = incomeCents - spentCents - investedCents;
  return {
    incomeCents,
    essentialCents,
    lifestyleCents,
    uncategorizedCents,
    investedCents,
    spentCents,
    leftoverCents: Math.max(0, balance),
    overflowCents: Math.max(0, -balance),
  };
}

/**
 * Divide `total` unidades inteiras proporcionalmente a `values` (maior resto): a soma sempre fecha em
 * `total`. Empate no resto: o maior valor primeiro, depois a ordem da lista. Tudo zero → tudo zero.
 */
export function apportion(values: readonly number[], total: number): number[] {
  for (const value of values) assertCents(value);
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError(`Total inválido: ${total}`);
  if (values.some((value) => value < 0)) throw new RangeError("Valores negativos não se repartem.");
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (sum === 0) return values.map(() => 0);
  // Inteiro: piso de value*total/sum e o resto da divisão, sem float.
  const parts = values.map((value, index) => ({ index, value, floor: Math.floor((value * total) / sum), remainder: (value * total) % sum }));
  let left = total - parts.reduce((acc, part) => acc + part.floor, 0);
  const order = [...parts].sort((a, b) => b.remainder - a.remainder || b.value - a.value || a.index - b.index);
  const result = parts.map((part) => part.floor);
  for (const part of order) {
    if (left === 0) break;
    result[part.index] = (result[part.index] ?? 0) + 1;
    left -= 1;
  }
  return result;
}

export type HundredKey = "essencial" | "estilo" | "sem" | "investido" | "sobrou";

export type PerHundred = {
  /** "entrou": de cada R$ 100 que entraram; "saiu": gastou mais do que entrou, a base é o que saiu. */
  base: "entrou" | "saiu";
  baseCents: number;
  parts: { key: HundredKey; cents: number; per100: number }[];
  /** Com base "saiu": de cada R$ 100 que saíram, quantos foram além do que entrou. */
  overflowPer100: number;
};

/** "De cada R$ 100": em reais inteiros, somando sempre 100. Nada entrou nem saiu → null. */
export function perHundred(flow: MonthFlow): PerHundred | null {
  const outCents = flow.spentCents + flow.investedCents;
  const fits = flow.incomeCents > 0 && flow.incomeCents >= outCents;
  const baseCents = fits ? flow.incomeCents : outCents;
  if (baseCents === 0) return null;
  const entries: { key: HundredKey; cents: number }[] = [
    { key: "essencial", cents: flow.essentialCents },
    { key: "estilo", cents: flow.lifestyleCents },
    { key: "sem", cents: flow.uncategorizedCents },
    { key: "investido", cents: flow.investedCents },
    ...(fits ? [{ key: "sobrou" as const, cents: flow.leftoverCents }] : []),
  ];
  const shares = apportion(
    entries.map((entry) => entry.cents),
    100,
  );
  return {
    base: fits ? "entrou" : "saiu",
    baseCents,
    parts: entries.map((entry, index) => ({ ...entry, per100: shares[index] ?? 0 })),
    overflowPer100: fits ? 0 : (apportion([flow.overflowCents, outCents - flow.overflowCents], 100)[0] ?? 0),
  };
}

/** Quanto sobrou do que entrou, em bps; negativo quando saiu mais do que entrou. Sem entrada → null. */
export function savingsRateBps(flow: MonthFlow): number | null {
  if (flow.incomeCents <= 0) return null;
  const balance = flow.leftoverCents - flow.overflowCents;
  return Math.round((balance * 10_000) / flow.incomeCents);
}
