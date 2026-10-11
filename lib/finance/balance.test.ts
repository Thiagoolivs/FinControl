import { describe, expect, it } from "vitest";
import { composeBalance, summarizeBalances, type BalanceAccount } from "./balance";

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

describe("composeBalance", () => {
  it("disponível é o saldo menos reservas e caixa do negócio", () => {
    expect(composeBalance({ grossCents: 2_184_567, reservedCents: 170_000, businessCashCents: 300_000 })).toEqual({
      grossCents: 2_184_567,
      reservedCents: 170_000,
      businessCashCents: 300_000,
      availableCents: 1_714_567,
    });
  });

  it("sem reservas, disponível = saldo", () => {
    expect(composeBalance({ grossCents: 100_000, reservedCents: 0, businessCashCents: 0 }).availableCents).toBe(100_000);
  });

  it("reserva maior que o saldo deixa o disponível negativo", () => {
    expect(composeBalance({ grossCents: 50_000, reservedCents: 80_000, businessCashCents: 0 }).availableCents).toBe(-30_000);
  });

  it("rejeita valor que não é centavo inteiro", () => {
    expect(() => composeBalance({ grossCents: 1.5, reservedCents: 0, businessCashCents: 0 })).toThrow(RangeError);
  });
});
