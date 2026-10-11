import { addMonths, monthsBetween } from "../dates";
import { assertCents } from "./money";

/**
 * Aporte mensal necessário: (alvo − atual) / meses restantes, arredondado para cima em reais inteiros
 * (R$ 2.214,29 → R$ 2.215). Arredondar para cima garante que pagar o valor mostrado basta para chegar ao alvo.
 * Meta já atingida → 0. Prazo vencido (`monthsLeft` <= 0) → tudo que falta, de uma vez.
 */
export function monthlyRequiredCents(targetCents: number, currentCents: number, monthsLeft: number): number {
  assertCents(targetCents);
  assertCents(currentCents);
  if (!Number.isInteger(monthsLeft)) throw new RangeError(`Meses restantes inválidos: ${monthsLeft}`);
  const remaining = targetCents - currentCents;
  if (remaining <= 0) return 0;
  const perMonth = Math.ceil(remaining / Math.max(1, monthsLeft));
  return Math.ceil(perMonth / 100) * 100;
}

/** Meses de aporte até o alvo, contando o mês corrente: de out/2026 até dez/2027 = 15. Alvo vencido → <= 0. */
export function contributionMonths(currentMonth: string, targetMonth: string): number {
  return monthsBetween(currentMonth, targetMonth) + 1;
}

export type Contribution = { date: string; amountCents: number };

/** Saldo da meta no dia 1 de `month`: soma dos aportes (e resgates) com data anterior. */
export function balanceBefore(contributions: readonly Contribution[], month: string): number {
  return contributions.filter((contribution) => contribution.date < `${month}-01`).reduce((sum, contribution) => sum + contribution.amountCents, 0);
}

/**
 * Aporte necessário no começo de `month`: o que faltava no dia 1 dividido pelos meses de aporte até o
 * alvo. Calculado do histórico de aportes, então é o mesmo valor não importa quando a tela é aberta.
 */
export function requiredAtMonthStart(goal: { targetCents: number; targetMonth: string }, contributions: readonly Contribution[], month: string): number {
  return monthlyRequiredCents(goal.targetCents, balanceBefore(contributions, month), contributionMonths(month, goal.targetMonth));
}

/**
 * Atrasada: o aporte necessário cresceu de um mês para o outro (começo do mês passado → começo deste),
 * ou o prazo passou sem a meta ser atingida. Meta criada neste mês ainda não tem com o que comparar.
 */
export function isGoalLate(
  goal: { targetCents: number; currentCents: number; targetMonth: string; createdMonth: string },
  contributions: readonly Contribution[],
  currentMonth: string,
): boolean {
  if (goal.currentCents >= goal.targetCents) return false;
  if (goal.targetMonth < currentMonth) return true;
  if (goal.createdMonth >= currentMonth) return false;
  return requiredAtMonthStart(goal, contributions, currentMonth) > requiredAtMonthStart(goal, contributions, addMonths(currentMonth, -1));
}

/**
 * Ritmo atual: média mensal líquida dos aportes nos últimos `window` meses fechados. O mês de criação fica
 * de fora (é onde entra o saldo inicial). Null quando ainda não há mês fechado para medir.
 */
export function monthlyPaceCents(contributions: readonly Contribution[], currentMonth: string, createdMonth: string, window = 3): number | null {
  const first = [addMonths(currentMonth, -window), addMonths(createdMonth, 1)].sort().at(-1) ?? currentMonth;
  const months = monthsBetween(first, currentMonth);
  if (months <= 0) return null;
  const total = contributions
    .filter((contribution) => contribution.date >= `${first}-01` && contribution.date < `${currentMonth}-01`)
    .reduce((sum, contribution) => sum + contribution.amountCents, 0);
  return Math.floor(total / months);
}

/** Meses de aporte de `monthlyCents` para cobrir `remainingCents`. Null quando o aporte não é positivo. */
export function monthsToReach(remainingCents: number, monthlyCents: number): number | null {
  assertCents(remainingCents);
  assertCents(monthlyCents);
  if (remainingCents <= 0) return 0;
  if (monthlyCents <= 0) return null;
  return Math.ceil(remainingCents / monthlyCents);
}

/** Mês em que a meta fecha aportando `monthlyCents` a partir deste mês. Null quando não fecha nunca. */
export function completionMonth(remainingCents: number, monthlyCents: number, currentMonth: string): string | null {
  const months = monthsToReach(remainingCents, monthlyCents);
  if (months === null) return null;
  return addMonths(currentMonth, Math.max(0, months - 1));
}
