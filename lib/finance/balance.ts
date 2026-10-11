import type { AccountType } from "@/generated/prisma/enums";
import { assertCents } from "./money";

export type BalanceAccount = {
  type: AccountType;
  balanceCents: number; // CREDIT: limite usado, positivo
  currency: string;
  includeInTotals: boolean;
};

export type BalanceSummary = {
  /** Corrente + poupança: o que os apps dos bancos mostram como saldo. */
  cashCents: number;
  /** Limite usado nos cartões. Não entra no saldo: é dívida a pagar, mostrada à parte. */
  creditUsedCents: number;
  /** Contas fora de BRL ficam de fora da soma (não há câmbio aqui). */
  foreignAccounts: number;
};

export function summarizeBalances(accounts: readonly BalanceAccount[]): BalanceSummary {
  const summary: BalanceSummary = { cashCents: 0, creditUsedCents: 0, foreignAccounts: 0 };
  for (const account of accounts) {
    assertCents(account.balanceCents);
    if (!account.includeInTotals) continue;
    if (account.currency !== "BRL") {
      summary.foreignAccounts += 1;
      continue;
    }
    if (account.type === "CHECKING" || account.type === "SAVINGS") summary.cashCents += account.balanceCents;
    else if (account.type === "CREDIT") summary.creditUsedCents += account.balanceCents;
  }
  return summary;
}

export type BalanceComposition = {
  grossCents: number; // saldo das contas
  reservedCents: number; // reserva de imposto + reserva de custo
  businessCashCents: number; // caixa do negócio
  availableCents: number; // o que sobra: quanto dá para gastar
};

/** Disponível = saldo das contas − reservas − caixa do negócio. Pode ficar negativo se as reservas passarem do saldo. */
export function composeBalance(input: { grossCents: number; reservedCents: number; businessCashCents: number }): BalanceComposition {
  assertCents(input.grossCents);
  assertCents(input.reservedCents);
  assertCents(input.businessCashCents);
  return { ...input, availableCents: input.grossCents - input.reservedCents - input.businessCashCents };
}
