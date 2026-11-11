import { describe, expect, it } from "vitest";
import { type BalanceAccount, summarizeBalances } from "./balance";

const account = (type: BalanceAccount["type"], balanceCents: number, extra: Partial<BalanceAccount> = {}): BalanceAccount => ({
  type,
  scope: "PF",
  balanceCents,
  autoInvestedCents: 0,
  savedCents: 0,
  currency: "BRL",
  includeInTotals: true,
  ...extra,
});

const empty = { grossCents: 0, personalCents: 0, savedCents: 0, businessCents: 0, autoInvestedCents: 0, creditUsedCents: 0, foreignAccounts: 0 };

describe("summarizeBalances", () => {
  it("divide em pessoal, guardado e empresa; cartão à parte", () => {
    const summary = summarizeBalances([
      account("CHECKING", 1_234_567, { autoInvestedCents: 210_000 }),
      account("SAVINGS", 500_000),
      account("CHECKING", 89_634, { savedCents: 825_000 }),
      account("CHECKING", 1_015_620, { scope: "PJ" }),
      account("CREDIT", 320_045),
    ]);
    expect(summary).toEqual({
      grossCents: 2_034_201 + 825_000 + 1_015_620,
      personalCents: 2_034_201,
      savedCents: 825_000,
      businessCents: 1_015_620,
      autoInvestedCents: 210_000,
      creditUsedCents: 320_045,
      foreignAccounts: 0,
    });
  });

  it("o total é sempre pessoal + guardado + empresa", () => {
    const summary = summarizeBalances([account("CHECKING", 10_000, { savedCents: 3_000 }), account("CHECKING", 7_000, { scope: "PJ", savedCents: 1_000 })]);
    expect(summary.grossCents).toBe(summary.personalCents + summary.savedCents + summary.businessCents);
  });

  it("saldo negativo (cheque especial) reduz o lado dele", () => {
    const summary = summarizeBalances([account("CHECKING", 100_000), account("CHECKING", -25_050)]);
    expect(summary.personalCents).toBe(74_950);
    expect(summary.grossCents).toBe(74_950);
  });

  it("ignora contas fora dos totais (com o que elas guardam) e investimento", () => {
    const summary = summarizeBalances([
      account("CHECKING", 100_000, { includeInTotals: false, autoInvestedCents: 50_000, savedCents: 10_000 }),
      account("INVESTMENT", 9_000_000),
      account("CHECKING", 1_000),
    ]);
    expect(summary).toEqual({ ...empty, grossCents: 1_000, personalCents: 1_000 });
  });

  it("não soma moeda estrangeira, mas conta quantas ficaram de fora", () => {
    const summary = summarizeBalances([account("CHECKING", 10_000, { currency: "USD", savedCents: 5_000 }), account("CHECKING", 5_000)]);
    expect(summary).toEqual({ ...empty, grossCents: 5_000, personalCents: 5_000, foreignAccounts: 1 });
  });

  it("caixinha em cartão não existe: só corrente e poupança guardam", () => {
    expect(summarizeBalances([account("CREDIT", 10_000, { savedCents: 999 })])).toEqual({ ...empty, creditUsedCents: 10_000 });
  });

  it("sem contas, tudo zero", () => {
    expect(summarizeBalances([])).toEqual(empty);
  });

  it("rejeita valor que não é centavo inteiro", () => {
    expect(() => summarizeBalances([account("CHECKING", 0, { savedCents: 0.5 })])).toThrow(RangeError);
  });
});
