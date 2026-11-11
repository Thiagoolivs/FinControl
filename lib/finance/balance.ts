import type { AccountType, Scope } from "@/generated/prisma/enums";
import { assertCents } from "./money";

export type BalanceAccount = {
  type: AccountType;
  scope: Scope;
  balanceCents: number; // CREDIT: limite usado, positivo
  /** Aplicação automática: o banco tira do saldo e resgata sozinho quando precisa. */
  autoInvestedCents: number;
  /** Caixinhas / saldo reservado dentro da conta: guardado por você, fora do saldo que o banco informa. */
  savedCents: number;
  currency: string;
  includeInTotals: boolean;
};

export type BalanceSummary = {
  /** Tudo que está nas contas (corrente + poupança): pessoal + guardado + empresa. */
  grossCents: number;
  /** Contas PF: saldo + aplicação automática, sem as caixinhas. */
  personalCents: number;
  /** Caixinhas de todas as contas. */
  savedCents: number;
  /** Contas PJ: saldo + aplicação automática, sem as caixinhas. */
  businessCents: number;
  /** Desse total, o que está em aplicação automática. */
  autoInvestedCents: number;
  /** Limite usado nos cartões. Não entra no saldo: é dívida a pagar, mostrada à parte. */
  creditUsedCents: number;
  /** Contas fora de BRL ficam de fora da soma (não há câmbio aqui). */
  foreignAccounts: number;
};

/** O dinheiro nas contas, dividido em pessoal (PF), guardado (caixinhas) e empresa (PJ). Cartão à parte. */
export function summarizeBalances(accounts: readonly BalanceAccount[]): BalanceSummary {
  const summary: BalanceSummary = { grossCents: 0, personalCents: 0, savedCents: 0, businessCents: 0, autoInvestedCents: 0, creditUsedCents: 0, foreignAccounts: 0 };
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
      const free = account.balanceCents + account.autoInvestedCents;
      if (account.scope === "PJ") summary.businessCents += free;
      else summary.personalCents += free;
      summary.savedCents += account.savedCents;
      summary.autoInvestedCents += account.autoInvestedCents;
      summary.grossCents += free + account.savedCents;
    } else if (account.type === "CREDIT") summary.creditUsedCents += account.balanceCents;
  }
  return summary;
}
