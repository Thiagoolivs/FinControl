import { addMonths, daysBetween, monthRange } from "@/lib/dates";
import { assertCents } from "./money";

export type FlowRow = {
  date: string;
  amountCents: number;
  /** Transferência entre duas contas do mesmo escopo (ou pagamento da fatura): se anula, não é entrada nem saída. */
  internal: boolean;
};

export type MonthFlowSummary = { month: string; inCents: number; outCents: number; netCents: number };

/**
 * Quanto entrou e saiu em cada mês pedido. Transferência entre contas do próprio escopo fica de fora (as duas
 * pernas se anulam); a que vem de fora do escopo conta (ex.: Pix da PJ olhando só a PF).
 */
export function flowsByMonth(rows: readonly FlowRow[], months: readonly string[]): MonthFlowSummary[] {
  const byMonth = new Map(months.map((month) => [month, { month, inCents: 0, outCents: 0, netCents: 0 }]));
  for (const row of rows) {
    assertCents(row.amountCents);
    const entry = byMonth.get(row.date.slice(0, 7));
    if (!entry || row.internal || row.amountCents === 0) continue;
    if (row.amountCents > 0) entry.inCents += row.amountCents;
    else entry.outCents -= row.amountCents;
    entry.netCents += row.amountCents;
  }
  return months.map((month) => byMonth.get(month) as MonthFlowSummary);
}

/** Parte de `cents` proporcional a `part / whole`, arredondada para o lado pior. */
export function prorate(cents: number, part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.floor((cents * part) / whole);
}

export type ProjectionInput = {
  today: string;
  /** Quantos meses mostrar, a partir do corrente (que entra só com o que falta do mês). */
  horizonMonths: number;
  /** Ponto de partida: dinheiro livre hoje (sem caixinhas), já tirando a fatura do cartão em aberto. */
  openingCents: number;
  /** Meses fechados recentes que os dados cobrem por inteiro. */
  history: readonly MonthFlowSummary[];
};

export type ProjectedMonth = { month: string; expectedCents: number; lowCents: number; highCents: number };

export type Projection = {
  /** Média do que sobrou (ou faltou) por mês; null sem nenhum mês de histórico. */
  averageNetCents: number | null;
  averageInCents: number | null;
  averageOutCents: number | null;
  worst: MonthFlowSummary | null;
  best: MonthFlowSummary | null;
  months: ProjectedMonth[];
};

const floorAverage = (values: readonly number[]) => Math.floor(values.reduce((sum, value) => sum + value, 0) / values.length);

/**
 * "Se continuar assim": o dinheiro livre de hoje somado à média do que sobrou nos últimos meses. A faixa é
 * todo mês igual ao pior e ao melhor mês recente. O mês corrente conta só os dias que faltam.
 */
export function projectByAverage(input: ProjectionInput): Projection {
  assertCents(input.openingCents);
  const current = input.today.slice(0, 7);
  const months = Array.from({ length: input.horizonMonths }, (_, index) => addMonths(current, index));
  const history = input.history;
  if (history.length === 0) {
    return {
      averageNetCents: null,
      averageInCents: null,
      averageOutCents: null,
      worst: null,
      best: null,
      months: months.map((month) => ({ month, expectedCents: input.openingCents, lowCents: input.openingCents, highCents: input.openingCents })),
    };
  }
  const nets = history.map((month) => month.netCents);
  const averageNetCents = floorAverage(nets);
  const worst = history.reduce((min, month) => (month.netCents < min.netCents ? month : min));
  const best = history.reduce((max, month) => (month.netCents > max.netCents ? month : max));
  const { from, to } = monthRange(current);
  const daysInMonth = daysBetween(from, to) + 1;
  const daysLeft = daysBetween(input.today, to);
  let expected = input.openingCents;
  let low = input.openingCents;
  let high = input.openingCents;
  return {
    averageNetCents,
    averageInCents: floorAverage(history.map((month) => month.inCents)),
    averageOutCents: floorAverage(history.map((month) => month.outCents)),
    worst,
    best,
    months: months.map((month, index) => {
      const share = (cents: number) => (index === 0 ? prorate(cents, daysLeft, daysInMonth) : cents);
      expected += share(averageNetCents);
      low += share(worst.netCents);
      high += share(best.netCents);
      return { month, expectedCents: expected, lowCents: low, highCents: high };
    }),
  };
}
