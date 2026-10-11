import { assertCents } from "./money";

export type IncomeSplit = {
  taxCents: number; // vai para a reserva de imposto
  costCents: number; // vai para a reserva de custo
  restCents: number; // disponível, ou caixa do negócio se a stream for VENTURE
};

function assertBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError(`Percentual inválido: ${bps} bps`);
}

/**
 * Divide uma entrada pelas reservas da stream. Imposto e custo arredondam meio centavo para cima;
 * o resto fecha a conta, então imposto + custo + resto é sempre exatamente a entrada.
 * 10.000,00 com 12% e 5% → 1.200,00 / 500,00 / 8.300,00.
 */
export function splitIncome(amountCents: number, taxBps: number, costBps: number): IncomeSplit {
  assertCents(amountCents);
  assertBps(taxBps);
  assertBps(costBps);
  if (taxBps + costBps > 10_000) throw new RangeError("Imposto + custo passam de 100%.");
  if (amountCents <= 0) return { taxCents: 0, costCents: 0, restCents: amountCents };
  const portion = (bps: number) => Math.floor((amountCents * bps + 5_000) / 10_000);
  const taxCents = portion(taxBps);
  const costCents = portion(costBps);
  return { taxCents, costCents, restCents: amountCents - taxCents - costCents };
}

/** Competência de uma data: "2026-10-08" → "2026-10". */
export function competenceOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * Vencimento de uma obrigação mensal: dia `dueDay` do mês seguinte à competência, limitado ao último dia
 * do mês (dia 31 em fevereiro vira 28/29). DAS de outubro/2026 com dia 20 → 2026-11-20.
 */
export function obligationDueDate(competence: string, dueDay: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) throw new RangeError(`Competência inválida: ${competence}`);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new RangeError(`Dia de vencimento inválido: ${dueDay}`);
  const [year, month] = competence.split("-").map(Number) as [number, number];
  const next = new Date(Date.UTC(year, month, 1)); // mês seguinte (month já é 1-based)
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(dueDay, lastDay));
  return next.toISOString().slice(0, 10);
}
