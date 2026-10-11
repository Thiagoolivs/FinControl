import { addMonths, daysBetween, monthRange } from "@/lib/dates";
import { assertCents } from "./money";
import { type Cadence, nextOccurrence } from "./recurring";

export type ProjectionInput = {
  today: string;
  /** Quantos meses mostrar, a partir do corrente (que entra só com o que ainda falta acontecer). */
  horizonMonths: number;
  /** Ponto de partida: disponível de hoje menos a fatura em aberto. */
  openingCents: number;
  /** Séries recorrentes ativas; receita já sem as reservas da stream. */
  recurring: readonly { amountCents: number; intervalDays: Cadence["intervalDays"]; nextExpectedDate: string }[];
  /** Parcelas de cartão que ainda vão cair (negativas). */
  installments: readonly { month: string; amountCents: number }[];
  /** Média mensal dos gastos que não são recorrentes nem parcela (≤ 0). */
  variableMonthlyCents: number;
  /** Aporte de cada meta até o mês do alvo; no mês corrente, só o que falta aportar nele. */
  goals: readonly { monthlyCents: number; untilMonth: string; currentMonthCents: number }[];
  /** Reservado todo mês do disponível (ex.: DAS). O do mês corrente já foi reservado. */
  obligationsMonthlyCents: number;
  /** Média de projetos avulsos (já sem reservas): só na linha otimista. Null = sem projetos. */
  projectsMonthlyCents: number | null;
  /** Caixa do negócio, linha separada. Null = sem negócio no escopo. */
  business: { openingCents: number; monthlyNetCents: number } | null;
};

export type ProjectedMonth = {
  month: string;
  incomeCents: number;
  expenseCents: number;
  goalsCents: number;
  obligationsCents: number;
  /** Saldo pessoal no fim do mês, sem projetos avulsos. */
  realisticCents: number;
  optimisticCents: number | null;
  businessCents: number | null;
};

/** Parte de `cents` proporcional a `part / whole`, arredondada para o lado pior (gasto maior, receita menor). */
export function prorate(cents: number, part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.floor((cents * part) / whole);
}

/**
 * Saldo mês a mês. A projeção não adivinha: soma só o que está nas premissas (recorrentes, parcelas,
 * média dos gastos variáveis, metas, obrigações). O mês corrente conta só o que ainda falta acontecer.
 */
export function projectCashFlow(input: ProjectionInput): ProjectedMonth[] {
  for (const value of [input.openingCents, input.variableMonthlyCents, input.obligationsMonthlyCents]) assertCents(value);
  const current = input.today.slice(0, 7);
  const months = Array.from({ length: input.horizonMonths }, (_, index) => addMonths(current, index));
  const last = months[months.length - 1];
  if (!last) return [];
  const end = monthRange(last).to;

  const income = new Map<string, number>();
  const expense = new Map<string, number>();
  const add = (map: Map<string, number>, month: string, cents: number) => {
    const key = month < current ? current : month;
    map.set(key, (map.get(key) ?? 0) + cents);
  };
  for (const series of input.recurring) {
    assertCents(series.amountCents);
    for (let date = series.nextExpectedDate; date <= end; date = nextOccurrence(date, series.intervalDays)) {
      add(series.amountCents > 0 ? income : expense, date.slice(0, 7), series.amountCents);
    }
  }
  for (const installment of input.installments) {
    assertCents(installment.amountCents);
    if (installment.month <= last) add(expense, installment.month, installment.amountCents);
  }

  const daysInMonth = daysBetween(monthRange(current).from, monthRange(current).to) + 1;
  const daysLeft = daysBetween(input.today, monthRange(current).to);
  let realistic = input.openingCents;
  let projects = 0;
  let business = input.business?.openingCents ?? 0;
  return months.map((month, index) => {
    const first = index === 0;
    const variable = first ? prorate(input.variableMonthlyCents, daysLeft, daysInMonth) : input.variableMonthlyCents;
    const goalsCents = 0 - input.goals.reduce(
      (sum, goal) => sum + (first ? goal.currentMonthCents : month <= goal.untilMonth ? goal.monthlyCents : 0),
      0,
    );
    const obligationsCents = first ? 0 : 0 - input.obligationsMonthlyCents;
    const incomeCents = income.get(month) ?? 0;
    const expenseCents = (expense.get(month) ?? 0) + variable;
    realistic += incomeCents + expenseCents + goalsCents + obligationsCents;
    if (input.projectsMonthlyCents !== null && !first) projects += input.projectsMonthlyCents;
    if (input.business) business += first ? prorate(input.business.monthlyNetCents, daysLeft, daysInMonth) : input.business.monthlyNetCents;
    return {
      month,
      incomeCents,
      expenseCents,
      goalsCents,
      obligationsCents,
      realisticCents: realistic,
      optimisticCents: input.projectsMonthlyCents === null ? null : realistic + projects,
      businessCents: input.business ? business : null,
    };
  });
}
