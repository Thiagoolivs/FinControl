import { assertCents } from "./money";

/**
 * Aporte mensal necessário: (alvo − atual) / meses restantes, arredondado para cima em reais inteiros
 * (R$ 2.214,29 → R$ 2.215). Arredondar para cima garante que pagar o valor mostrado basta para chegar ao alvo.
 * Meta já atingida → 0. Prazo vencido ou no mês corrente (`monthsLeft` <= 0) → tudo que falta, de uma vez.
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
