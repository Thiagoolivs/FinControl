import { describe, expect, it } from "vitest";
import { summarizeBalances, type BalanceAccount } from "./balance";

const account = (type: BalanceAccount["type"], balanceCents: number, extra: Partial<BalanceAccount> = {}): BalanceAccount => ({
  type,
  balanceCents,
  currency: "BRL",
  includeInTotals: true,
  ...extra,
});

describe("summarizeBalances", () => {
  it("soma corrente e poupança como saldo, cartão à parte", () => {
    const summary = summarizeBalances([
      account("CHECKING", 1_234_567),
      account("SAVINGS", 500_000),
      account("CREDIT", 320_045),
    ]);
    expect(summary).toEqual({ cashCents: 1_734_567, creditUsedCents: 320_045, foreignAccounts: 0 });
  });

  it("saldo negativo (cheque especial) reduz o total", () => {
    expect(summarizeBalances([account("CHECKING", 100_000), account("CHECKING", -25_050)]).cashCents).toBe(74_950);
  });

  it("ignora contas marcadas fora dos totais e investimento", () => {
    const summary = summarizeBalances([
      account("CHECKING", 100_000, { includeInTotals: false }),
      account("INVESTMENT", 9_000_000),
      account("CHECKING", 1_000),
    ]);
    expect(summary.cashCents).toBe(1_000);
  });

  it("não soma moeda estrangeira, mas conta quantas ficaram de fora", () => {
    const summary = summarizeBalances([account("CHECKING", 10_000, { currency: "USD" }), account("CHECKING", 5_000)]);
    expect(summary).toEqual({ cashCents: 5_000, creditUsedCents: 0, foreignAccounts: 1 });
  });

  it("sem contas, tudo zero", () => {
    expect(summarizeBalances([])).toEqual({ cashCents: 0, creditUsedCents: 0, foreignAccounts: 0 });
  });
});
