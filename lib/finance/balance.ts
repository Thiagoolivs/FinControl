import type { AccountType } from "@/generated/prisma/enums";
import { assertCents } from "./money";

export type BalanceAccount = {
  type: AccountType;
  balanceCents: number; // CREDIT: limite usado, positivo
  /** Aplicação automática: o banco tira do saldo e resgata sozinho quando precisa. */
  autoInvestedCents: number;
  /** Caixinhas / saldo reservado dentro da conta: guardado por você, fora do saldo que o banco informa. */
  savedCents: number;
  currency: string;
  includeInTotals: boolean;
};

export type BalanceSummary = {
  /** Tudo que está nas contas (corrente + poupança): saldo + aplicação automática + caixinhas. */
  grossCents: number;
  /** Desse total, o que está em aplicação automática. Entra no disponível: o banco resgata sozinho. */
  autoInvestedCents: number;
  /** Desse total, o que está guardado em caixinhas. Não entra no disponível. */
  savedCents: number;
  /** Limite usado nos cartões. Não entra no saldo: é dívida a pagar, mostrada à parte. */
  creditUsedCents: number;
  /** Contas fora de BRL ficam de fora da soma (não há câmbio aqui). */
  foreignAccounts: number;
};

export function summarizeBalances(accounts: readonly BalanceAccount[]): BalanceSummary {
  const summary: BalanceSummary = { grossCents: 0, autoInvestedCents: 0, savedCents: 0, creditUsedCents: 0, foreignAccounts: 0 };
  for (const account of accounts) {
    assertCents(account.balanceCents);
    assertCents(account.autoInvestedCents);
    assertCents(account.savedCents);
    if (!account.includeInTotals) continue;
    if (account.currency !== "BRL") {
      summary.foreignAccounts += 1;
      continue;
    }
    if (account.type === "CHECKING" || account.type === "SAVINGS") {
      summary.grossCents += account.balanceCents + account.autoInvestedCents + account.savedCents;
      summary.autoInvestedCents += account.autoInvestedCents;
      summary.savedCents += account.savedCents;
    } else if (account.type === "CREDIT") summary.creditUsedCents += account.balanceCents;
  }
  return summary;
}

export type BalanceComposition = {
  grossCents: number; // saldo das contas
  savedCents: number; // caixinhas
  reservedCents: number; // reserva de imposto + reserva de custo
  businessCashCents: number; // caixa do negócio
  availableCents: number; // o que sobra: quanto dá para gastar
};

/**
 * Disponível = saldo das contas − caixinhas − reservas − caixa do negócio.
 * Pode ficar negativo se as reservas passarem do saldo.
 */
export function composeBalance(input: { grossCents: number; savedCents: number; reservedCents: number; businessCashCents: number }): BalanceComposition {
  assertCents(input.grossCents);
  assertCents(input.savedCents);
  assertCents(input.reservedCents);
  assertCents(input.businessCashCents);
  return { ...input, availableCents: input.grossCents - input.savedCents - input.reservedCents - input.businessCashCents };
}
