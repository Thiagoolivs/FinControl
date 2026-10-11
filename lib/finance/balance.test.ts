import { describe, expect, it } from "vitest";
import { composeBalance, summarizeBalances, type BalanceAccount } from "./balance";

const account = (type: BalanceAccount["type"], balanceCents: number, extra: Partial<BalanceAccount> = {}): BalanceAccount => ({
  type,
  balanceCents,
  autoInvestedCents: 0,
  savedCents: 0,
  currency: "BRL",
  includeInTotals: true,
  ...extra,
});

const empty = { grossCents: 0, autoInvestedCents: 0, savedCents: 0, creditUsedCents: 0, foreignAccounts: 0 };

describe("summarizeBalances", () => {
  it("soma corrente e poupança como saldo, cartão à parte", () => {
    const summary = summarizeBalances([
      account("CHECKING", 1_234_567),
      account("SAVINGS", 500_000),
      account("CREDIT", 320_045),
    ]);
    expect(summary).toEqual({ ...empty, grossCents: 1_734_567, creditUsedCents: 320_045 });
  });

  it("aplicação automática e caixinhas entram no saldo das contas e aparecem separadas", () => {
    const summary = summarizeBalances([
      account("CHECKING", 120_000, { autoInvestedCents: 380_000 }),
      account("CHECKING", 15_000, { savedCents: 250_050 }),
    ]);
    expect(summary).toEqual({ ...empty, grossCents: 765_050, autoInvestedCents: 380_000, savedCents: 250_050 });
  });

  it("saldo negativo (cheque especial) reduz o total", () => {
    expect(summarizeBalances([account("CHECKING", 100_000), account("CHECKING", -25_050)]).grossCents).toBe(74_950);
  });

  it("ignora contas marcadas fora dos totais (com o que elas guardam) e investimento", () => {
    const summary = summarizeBalances([
      account("CHECKING", 100_000, { includeInTotals: false, autoInvestedCents: 50_000, savedCents: 10_000 }),
      account("INVESTMENT", 9_000_000),
      account("CHECKING", 1_000),
    ]);
    expect(summary).toEqual({ ...empty, grossCents: 1_000 });
  });

  it("não soma moeda estrangeira, mas conta quantas ficaram de fora", () => {
    const summary = summarizeBalances([account("CHECKING", 10_000, { currency: "USD", savedCents: 5_000 }), account("CHECKING", 5_000)]);
    expect(summary).toEqual({ ...empty, grossCents: 5_000, foreignAccounts: 1 });
  });

  it("caixinha em cartão não existe: só corrente e poupança guardam", () => {
    expect(summarizeBalances([account("CREDIT", 10_000, { savedCents: 999 })])).toEqual({ ...empty, creditUsedCents: 10_000 });
  });

  it("sem contas, tudo zero", () => {
    expect(summarizeBalances([])).toEqual(empty);
  });

  it("rejeita valor guardado que não é centavo inteiro", () => {
    expect(() => summarizeBalances([account("CHECKING", 0, { savedCents: 0.5 })])).toThrow(RangeError);
  });
});

describe("composeBalance", () => {
  it("disponível é o saldo menos reservas e caixa do negócio", () => {
    expect(composeBalance({ grossCents: 2_184_567, savedCents: 0, reservedCents: 170_000, businessCashCents: 300_000 })).toEqual({
      grossCents: 2_184_567,
      savedCents: 0,
      reservedCents: 170_000,
      businessCashCents: 300_000,
      availableCents: 1_714_567,
    });
  });

  it("caixinhas saem do disponível: é dinheiro guardado", () => {
    expect(composeBalance({ grossCents: 765_050, savedCents: 250_050, reservedCents: 0, businessCashCents: 0 }).availableCents).toBe(515_000);
  });

  it("sem reservas, disponível = saldo", () => {
    expect(composeBalance({ grossCents: 100_000, savedCents: 0, reservedCents: 0, businessCashCents: 0 }).availableCents).toBe(100_000);
  });

  it("reserva maior que o saldo deixa o disponível negativo", () => {
    expect(composeBalance({ grossCents: 50_000, savedCents: 0, reservedCents: 80_000, businessCashCents: 0 }).availableCents).toBe(-30_000);
  });

  it("rejeita valor que não é centavo inteiro", () => {
    expect(() => composeBalance({ grossCents: 1.5, savedCents: 0, reservedCents: 0, businessCashCents: 0 })).toThrow(RangeError);
    expect(() => composeBalance({ grossCents: 0, savedCents: 0.1, reservedCents: 0, businessCashCents: 0 })).toThrow(RangeError);
  });
});
